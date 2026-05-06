import { useState, useEffect, useRef, useCallback } from 'react'
import { buildPrompt, parseExtraction } from '../utils/nlpHelpers'
import { getSharedWorker, attachListener } from '../workers/sharedNlpWorker'

export function useNLP() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [webGPUSupported] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator
  )
  const pendingRef = useRef(null)
  const unloadRef = useRef(null)
  const detachRef = useRef(null)

  useEffect(() => {
    return () => {
      detachRef.current?.()
      // Worker is owned at module scope and may be in use by useSimplifier;
      // do NOT terminate on unmount. The shared worker preserves the loaded
      // model across NLP panel toggles.
    }
  }, [])

  function ensureSubscribed() {
    if (detachRef.current) return
    detachRef.current = attachListener(handleMessage)
  }

  function handleMessage(event) {
    const { type, progress: p, raw, message } = event.data ?? {}
    // Phase 3 messages have a taskId field; ignore them in this hook.
    if (event.data?.taskId) return

    if (type === 'progress') {
      setStatus('downloading')
      setProgress(p)
    } else if (type === 'ready') {
      setStatus('ready')
      setProgress(null)
    } else if (type === 'result') {
      setStatus('ready')
      if (pendingRef.current) {
        pendingRef.current.resolve(parseExtraction(raw))
        pendingRef.current = null
      }
    } else if (type === 'unloaded') {
      setStatus('idle')
      setProgress(null)
      setError(null)
      if (unloadRef.current) {
        unloadRef.current.resolve()
        unloadRef.current = null
      }
    } else if (type === 'error') {
      if (unloadRef.current) {
        unloadRef.current.reject(new Error(message ?? 'unload failed'))
        unloadRef.current = null
      } else if (pendingRef.current) {
        setStatus('ready')
        pendingRef.current.resolve(null)
        pendingRef.current = null
      } else {
        setStatus('error')
        setError(message)
      }
    }
  }

  const load = useCallback((modelId, options = {}) => {
    if (!webGPUSupported) return
    setError(null)
    ensureSubscribed()
    setStatus('downloading')
    getSharedWorker().postMessage({
      type: 'load',
      modelId,
      isThinking: Boolean(options.isThinking),
      chatOpts: options.chatOpts,
    })
  }, [webGPUSupported])

  const extract = useCallback((text) => {
    ensureSubscribed()
    if (pendingRef.current) return Promise.reject(new Error('Extraction already in progress'))
    return new Promise((resolve) => {
      setStatus('extracting')
      pendingRef.current = { resolve }
      getSharedWorker().postMessage({ type: 'extract', text: buildPrompt(text) })
    })
  }, [])

  // Releases the loaded engine and deletes WebLLM's on-disk cache for the
  // given model. Resolves when both are done. Used by the "Clear local
  // data" affordance — the only data IRIS ever stores locally is the
  // model itself, so this returns the user to a fresh state.
  const clearLocalData = useCallback((modelId) => {
    ensureSubscribed()
    if (unloadRef.current) return Promise.reject(new Error('Unload already in progress'))
    return new Promise((resolve, reject) => {
      unloadRef.current = { resolve, reject }
      getSharedWorker().postMessage({ type: 'unload', modelId })
    })
  }, [])

  return { status, progress, error, webGPUSupported, load, extract, clearLocalData }
}
