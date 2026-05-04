import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildSummarizePrompt,
  buildAssessFitPrompt,
  parseSummarizeStream,
} from '../utils/simplifyHelpers'

const initialSummarize = () => ({ status: 'queued', buffer: '', summary: '', eligibility: null, error: null })
const initialFit = () => ({ status: 'queued', text: '', error: null })

let nextTaskId = 0
const newTaskId = () => `t${++nextTaskId}`

export function useSimplifier({ modelKey, userDescription, extractedFields }) {
  const [states, setStates] = useState(() => new Map())
  const queueRef = useRef([])           // { taskId, type, nctId, prompt }
  const inFlightRef = useRef(null)      // { taskId, type, nctId }
  const taskIndexRef = useRef(new Map()) // taskId -> { nctId, type }
  const statusRef = useRef(new Map())   // `${nctId}:${type}` -> 'queued' | 'streaming' | 'complete' | 'error'
  const workerRef = useRef(null)

  const statusKey = (nctId, type) => `${nctId}:${type}`

  function ensureWorker() {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../workers/nlp.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = handleWorkerMessage
    worker.onerror = (err) => {
      if (inFlightRef.current) {
        applyTaskError(inFlightRef.current.taskId, err?.message ?? 'worker crashed')
      }
    }
    return worker
  }

  function handleWorkerMessage(event) {
    const { type, taskId, text, message } = event.data ?? {}
    // not a Phase 3 message; the NLP hook owns 'extract' responses
    if (!taskId) return
    const meta = taskIndexRef.current.get(taskId)
    if (!meta) {
      // The task was cancelled via resetCache, but the worker is still echoing.
      // For terminal events on the in-flight task, we still need to clear
      // inFlightRef so the queue can advance — otherwise future enqueues hang.
      if ((type === 'task_done' || type === 'task_error') && inFlightRef.current?.taskId === taskId) {
        inFlightRef.current = null
        maybeStartNext()
      }
      return
    }

    if (type === 'chunk') {
      applyChunk(meta, taskId, text ?? '')
    } else if (type === 'task_done') {
      applyTaskDone(meta, taskId)
      maybeStartNext()
    } else if (type === 'task_error') {
      applyTaskError(taskId, message ?? 'unknown error')
      maybeStartNext()
    }
  }

  function applyChunk(meta, taskId, text) {
    statusRef.current.set(statusKey(meta.nctId, meta.type), 'streaming')
    setStates(prev => {
      const next = new Map(prev)
      const cur = next.get(meta.nctId)
      if (!cur) return prev
      if (meta.type === 'summarize') {
        const buffer = cur.summarize.buffer + text
        const parsed = parseSummarizeStream(buffer)
        next.set(meta.nctId, {
          ...cur,
          summarize: {
            ...cur.summarize,
            status: 'streaming',
            buffer,
            summary: parsed.summary,
            eligibility: parsed.eligibility,
          },
        })
      } else {
        next.set(meta.nctId, {
          ...cur,
          fit: { ...cur.fit, status: 'streaming', text: cur.fit.text + text },
        })
      }
      return next
    })
  }

  function applyTaskDone(meta, taskId) {
    setStates(prev => {
      const next = new Map(prev)
      const cur = next.get(meta.nctId)
      if (!cur) return prev
      if (meta.type === 'summarize') {
        next.set(meta.nctId, { ...cur, summarize: { ...cur.summarize, status: 'complete' } })
      } else {
        next.set(meta.nctId, { ...cur, fit: { ...cur.fit, status: 'complete' } })
      }
      return next
    })
    statusRef.current.set(statusKey(meta.nctId, meta.type), 'complete')
    taskIndexRef.current.delete(taskId)
    inFlightRef.current = null
  }

  function applyTaskError(taskId, message) {
    const meta = taskIndexRef.current.get(taskId)
    if (meta) {
      statusRef.current.set(statusKey(meta.nctId, meta.type), 'error')
      setStates(prev => {
        const next = new Map(prev)
        const cur = next.get(meta.nctId)
        if (!cur) return prev
        if (meta.type === 'summarize') {
          next.set(meta.nctId, {
            ...cur,
            summarize: { ...cur.summarize, status: 'error', error: message },
          })
        } else {
          next.set(meta.nctId, {
            ...cur,
            fit: { ...cur.fit, status: 'error', error: message },
          })
        }
        return next
      })
      taskIndexRef.current.delete(taskId)
    }
    inFlightRef.current = null
  }

  function maybeStartNext() {
    if (inFlightRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    inFlightRef.current = { taskId: next.taskId, type: next.type, nctId: next.nctId }
    taskIndexRef.current.set(next.taskId, { nctId: next.nctId, type: next.type })
    ensureWorker().postMessage({ type: next.type, taskId: next.taskId, prompt: next.prompt })
  }

  const enqueueSummarize = useCallback((trial) => {
    const nctId = trial.nctId
    const key = statusKey(nctId, 'summarize')
    const existing = statusRef.current.get(key)
    if (existing === 'complete' || existing === 'streaming' || existing === 'queued') return
    statusRef.current.set(key, 'queued')
    setStates(prev => {
      const cur = prev.get(nctId)
      const next = new Map(prev)
      next.set(nctId, { ...(cur ?? {}), summarize: initialSummarize() })
      return next
    })
    const taskId = newTaskId()
    queueRef.current.push({
      taskId,
      type: 'summarize',
      nctId,
      prompt: buildSummarizePrompt(trial),
    })
    maybeStartNext()
  }, [modelKey])

  const enqueueAssessFit = useCallback((trial) => {
    if (!extractedFields) return
    const nctId = trial.nctId
    const key = statusKey(nctId, 'assess_fit')
    const existing = statusRef.current.get(key)
    if (existing === 'complete' || existing === 'streaming' || existing === 'queued') return
    statusRef.current.set(key, 'queued')
    setStates(prev => {
      const cur = prev.get(nctId)
      const next = new Map(prev)
      next.set(nctId, { ...(cur ?? {}), fit: initialFit() })
      return next
    })
    const taskId = newTaskId()
    queueRef.current.push({
      taskId,
      type: 'assess_fit',
      nctId,
      prompt: buildAssessFitPrompt(trial, extractedFields, userDescription),
    })
    maybeStartNext()
  }, [extractedFields, userDescription, modelKey])

  const cancelPending = useCallback(() => {
    queueRef.current = []
  }, [])

  const resetCache = useCallback(() => {
    queueRef.current = []
    taskIndexRef.current = new Map()
    statusRef.current = new Map()
    // inFlightRef is intentionally NOT cleared — its terminal echo is handled
    // in handleWorkerMessage and will re-enable maybeStartNext() to drain the queue.
    setStates(new Map())
  }, [])

  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

  return { states, enqueueSummarize, enqueueAssessFit, cancelPending, resetCache }
}
