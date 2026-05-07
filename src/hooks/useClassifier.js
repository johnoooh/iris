import { useRef, useEffect, useCallback } from 'react'
import { getSharedWorker, attachListener } from '../workers/sharedNlpWorker'

// Stage-1 classifier hook. Posts a 'classify' task to the shared NLP worker
// and resolves with { raw, latencyMs }. The caller parses the verdict from
// raw — keeps the worker dumb and the parsing rules co-located with the
// harness/UI.
//
// The worker must already have the model loaded (use NL tab + consent first,
// or call useNLP().load() somewhere). classifyOne will reject with
// 'Engine not loaded' otherwise.
export function useClassifier() {
  const pendingRef = useRef(new Map())
  const detachRef = useRef(null)
  const taskIdRef = useRef(0)

  function ensureSubscribed() {
    if (detachRef.current) return
    detachRef.current = attachListener(handleMessage)
  }

  function handleMessage(event) {
    const { type, taskId, raw, latencyMs, message } = event.data ?? {}
    if (type !== 'classify_done' && type !== 'classify_error') return
    const pending = pendingRef.current.get(taskId)
    if (!pending) return
    pendingRef.current.delete(taskId)
    if (type === 'classify_done') pending.resolve({ raw, latencyMs })
    else pending.reject(new Error(message ?? 'classify failed'))
  }

  useEffect(() => {
    return () => {
      detachRef.current?.()
      detachRef.current = null
    }
  }, [])

  const classifyOne = useCallback((prompt) => {
    ensureSubscribed()
    const taskId = `classify-${++taskIdRef.current}`
    return new Promise((resolve, reject) => {
      pendingRef.current.set(taskId, { resolve, reject })
      getSharedWorker().postMessage({ type: 'classify', taskId, prompt })
    })
  }, [])

  return { classifyOne }
}
