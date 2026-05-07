import { useRef, useEffect, useCallback } from 'react'
import { getSharedWorker, attachListener } from '../workers/sharedNlpWorker'

// Two task hooks (classifyOne, translateOne) share a single promise chain
// because WebLLM's MLCEngine is NOT parallel-safe. Concurrent
// engine.chat.completions.create() calls clobber state and produce
// "Message error should not be 0" failures. Callers can fire-and-forget
// concurrently; each request waits its turn behind the chain.
//
// The two task types are functionally similar (one-shot completion with
// raw + latencyMs return) but conceptually distinct, so they get distinct
// worker message types ('classify' vs 'translate') for clarity and so the
// worker can use different max_tokens budgets.
//
// The worker must already have the model loaded. classify/translateOne
// reject with 'Engine not loaded' otherwise.
export function useClassifier() {
  const pendingRef = useRef(new Map())
  const detachRef = useRef(null)
  const taskIdRef = useRef(0)
  const chainRef = useRef(Promise.resolve())

  function ensureSubscribed() {
    if (detachRef.current) return
    detachRef.current = attachListener(handleMessage)
  }

  function handleMessage(event) {
    const { type, taskId, raw, latencyMs, message } = event.data ?? {}
    const isDone = type === 'classify_done' || type === 'translate_done'
    const isError = type === 'classify_error' || type === 'translate_error'
    if (!isDone && !isError) return
    const pending = pendingRef.current.get(taskId)
    if (!pending) return
    pendingRef.current.delete(taskId)
    if (isDone) pending.resolve({ raw, latencyMs })
    else pending.reject(new Error(message ?? 'task failed'))
  }

  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      detachRef.current?.()
      detachRef.current = null
      // Reject every in-flight task so awaiting callers don't hang
      // forever when the component unmounts mid-batch (or during a
      // StrictMode dev double-invoke).
      for (const { reject } of pending.values()) {
        reject(new Error('classifier unmounted'))
      }
      pending.clear()
    }
  }, [])

  // Generic task runner — same chain semantics, different worker message
  // type. taskIdPrefix lets handleMessage route done/error messages back
  // to the right pending entry; it doesn't have to be unique per type
  // (the Map is keyed on the full taskId) but it makes worker logs
  // self-documenting.
  function runTask(workerType, taskIdPrefix, prompt) {
    ensureSubscribed()
    const taskId = `${taskIdPrefix}-${++taskIdRef.current}`
    const next = chainRef.current.catch(() => {}).then(() =>
      new Promise((resolve, reject) => {
        pendingRef.current.set(taskId, { resolve, reject })
        getSharedWorker().postMessage({ type: workerType, taskId, prompt })
      })
    )
    chainRef.current = next
    return next
  }

  // runTask only closes over refs (pendingRef, chainRef, taskIdRef, detachRef)
  // which are stable across renders, so it's safe to omit from useCallback
  // deps. The exhaustive-deps lint can't see through this because runTask
  // is defined in the function body each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classifyOne = useCallback((prompt) => runTask('classify', 'classify', prompt), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const translateOne = useCallback((prompt) => runTask('translate', 'translate', prompt), [])

  return { classifyOne, translateOne }
}
