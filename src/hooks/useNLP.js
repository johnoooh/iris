import { useState, useEffect, useRef, useCallback } from 'react'
import { buildPrompt, parseExtraction } from '../utils/nlpHelpers'

export function useNLP() {
  const [status, setStatus] = useState('idle') // idle | downloading | ready | extracting | error
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [webGPUSupported] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator
  )
  const workerRef = useRef(null)
  const pendingRef = useRef(null) // { resolve, reject } for the in-flight extract()

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  function initWorker() {
    if (workerRef.current) return
    const workerUrl = new URL('../workers/nlp.worker.js', import.meta.url)
    const workerOpts = { type: 'module' }
    let worker
    try {
      worker = new Worker(workerUrl, workerOpts)
    } catch {
      // Fallback for test environments where Worker is stubbed as an arrow function
      // (arrow functions cannot be called with `new` in Vitest 4.x)
      worker = Worker(workerUrl, workerOpts)
    }
    workerRef.current = worker

    worker.onmessage = (event) => {
      const { type, progress: p, raw, message } = event.data

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
      } else if (type === 'error') {
        if (pendingRef.current) {
          // Error during extraction — return to ready with null result
          setStatus('ready')
          pendingRef.current.resolve(null)
          pendingRef.current = null
        } else {
          // Error during load
          setStatus('error')
          setError(message)
        }
      }
    }

    worker.onerror = (err) => {
      setStatus('error')
      setError(err.message)
      if (pendingRef.current) {
        pendingRef.current.resolve(null)
        pendingRef.current = null
      }
    }
  }

  function load() {
    if (!webGPUSupported) return
    initWorker()
    setStatus('downloading')
    workerRef.current.postMessage({ type: 'load' })
  }

  const extract = useCallback((text) => {
    return new Promise((resolve) => {
      setStatus('extracting')
      pendingRef.current = { resolve }
      workerRef.current.postMessage({ type: 'extract', text: buildPrompt(text) })
    })
  }, [])

  return { status, progress, error, webGPUSupported, load, extract }
}
