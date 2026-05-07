import { useRef, useEffect, useCallback } from 'react'
import { getSharedWorker, attachListener } from '../workers/sharedNlpWorker'

// Stage-1 classifier hook. Posts a 'classify' task to the shared NLP worker
// and resolves with { raw, latencyMs }. The caller parses the verdict.
//
// IMPORTANT: WebLLM's MLCEngine is NOT parallel-safe. Concurrent
// engine.chat.completions.create() calls clobber each other's state and
// produce "Message error should not be 0" failures. We serialize all
// classify requests through a single promise chain at the hook level —
// callers can fire-and-forget concurrently, but each request waits its
// turn. Caller-side concurrency knobs become a no-op for actual
// parallelism, but still control queue capacity.
//
// The worker must already have the model loaded.
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
    // Chain onto the previous request so only one inference runs at a time.
    // .catch in the chain prevents one failure from breaking the whole queue.
    const next = chainRef.current.catch(() => {}).then(() =>
      new Promise((resolve, reject) => {
        pendingRef.current.set(taskId, { resolve, reject })
        getSharedWorker().postMessage({ type: 'classify', taskId, prompt })
      })
    )
    chainRef.current = next
    return next
  }, [])

  return { classifyOne }
}
