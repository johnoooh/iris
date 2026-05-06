import { useState, useEffect, useRef } from 'react'
import { useNLP } from '../hooks/useNLP'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'

const STORAGE_KEY = 'iris_nlp_enabled'

export default function NaturalLanguageInput({ onExtract }) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [extracted, setExtracted] = useState(null)
  const [consented, setConsented] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
  })

  // Model is selected once per page load via ?model=<key> (defaults to gemma).
  // Resolved at mount so a mid-session URL change doesn't swap models out
  // from under an in-flight extraction.
  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )
  const model = NLP_MODELS[modelKey]

  const { status, progress, error, webGPUSupported, load, extract } = useNLP()

  const hasAutoLoaded = useRef(false)

  // Auto-load model on expand if user previously consented
  useEffect(() => {
    if (!expanded) { hasAutoLoaded.current = false; return }
    if (hasAutoLoaded.current) return
    if (consented && status === 'idle' && webGPUSupported) {
      hasAutoLoaded.current = true
      load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })
    }
  }, [expanded, consented, status, webGPUSupported, load, model.id])

  function handleConsent() {
    try { localStorage.setItem(STORAGE_KEY, 'true') } catch { /* private browsing */ }
    setConsented(true)
    load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    const fields = await extract(text.trim())
    setExtracted(fields)
    if (fields && typeof onExtract === 'function') {
      onExtract({ fields, description: text.trim() })
    }
  }

  function getProgressLabel() {
    if (!progress) return 'Downloading AI model…'
    if (progress.text) return progress.text
    return `Downloading AI model… ${Math.round((progress.progress ?? 0) * 100)}%`
  }

  const badgeLabel = !webGPUSupported ? 'Unavailable' : 'New'
  const badgeClass = !webGPUSupported
    ? 'bg-parchment-200 text-parchment-700'
    : 'bg-parchment-500 text-parchment-950'

  return (
    <div className="bg-parchment-100 border-b border-parchment-300 px-6 py-3">
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-parchment-800 hover:text-parchment-950"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls="nlp-panel"
      >
        <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
        <span>Or, describe your situation in your own words</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${badgeClass}`}>{badgeLabel}</span>
      </button>

      {expanded && (
        <div id="nlp-panel" className="mt-3 max-w-xl">
          {/* WebGPU unavailable */}
          {!webGPUSupported && (
            <div className="bg-parchment-50 border border-parchment-300 rounded-md p-3">
              <p className="text-sm text-parchment-800">
                This feature requires a{' '}
                <strong className="text-parchment-950">WebGPU-capable browser</strong>: Chrome 113+,
                Edge 113+, or Safari 17.4+. Your current browser doesn&apos;t support it.
              </p>
            </div>
          )}

          {/* Consent screen */}
          {webGPUSupported && !consented && (
            <div className="bg-parchment-50 border border-parchment-300 rounded-md p-4">
              <h4 className="text-sm font-semibold text-parchment-950 mb-2">
                One-time setup: download AI model
              </h4>
              <p className="text-sm text-parchment-800 mb-2">
                This feature uses a small AI model ({model.label}) that runs entirely in your browser.
                Your words are <strong>never sent to any server</strong>.
              </p>
              <p className="text-xs text-parchment-700 mb-3">
                ⬇ {model.sizeLabel} · Downloads once, cached in your browser · Requires Chrome 113+, Edge
                113+, or Safari 17.4+
              </p>
              <button
                type="button"
                onClick={handleConsent}
                className="bg-parchment-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-parchment-950"
              >
                Download &amp; enable
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-2 text-sm text-parchment-700 border border-parchment-400 px-4 py-2 rounded-md hover:text-parchment-950"
              >
                Not now
              </button>
            </div>
          )}

          {/* Downloading / initialising */}
          {webGPUSupported && consented && status === 'downloading' && (
            <div>
              <p className="text-sm text-parchment-800 italic mb-2">{getProgressLabel()}</p>
              <div
                className="bg-parchment-300 rounded-full h-1.5 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
              >
                <div
                  className="bg-parchment-800 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-parchment-700 mt-1">This only happens once.</p>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="bg-parchment-50 border border-parchment-400 rounded-md p-3">
              <p className="text-sm text-parchment-900">
                Something went wrong —{' '}
                <button type="button" onClick={handleConsent} className="underline">
                  try again
                </button>
              </p>
            </div>
          )}

          {/* Ready / extracting */}
          {webGPUSupported && consented && (status === 'ready' || status === 'extracting') && (
            <form onSubmit={handleSubmit}>
              <textarea
                rows={3}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. 52-year-old woman in Brooklyn with triple negative breast cancer, already did chemo"
                className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white text-parchment-950 resize-none focus:outline-none focus:ring-2 focus:ring-parchment-800"
                aria-label="Natural language search"
                disabled={status === 'extracting'}
              />
              <p className="mt-1 text-xs text-parchment-700">
                IRIS will extract condition, location, age, and other relevant details automatically.
                {' '}<span className="text-parchment-500">Model: {model.label}</span>
              </p>
              <button
                type="submit"
                disabled={status === 'extracting' || !text.trim()}
                className="mt-2 bg-parchment-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-parchment-950 disabled:opacity-50"
              >
                {status === 'extracting' ? 'Extracting…' : 'Find trials →'}
              </button>
            </form>
          )}

          {/* Confirmation card */}
          {extracted && status === 'ready' && (
            <div className="mt-3 bg-white border-2 border-parchment-700 rounded-lg p-4">
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-3">
                Here&apos;s what I understood
              </h4>
              <div className="flex flex-wrap gap-2 mb-2">
                {extracted.condition && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Condition</span>
                    {extracted.condition}
                  </span>
                )}
                {extracted.location && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Location</span>
                    {extracted.location}
                  </span>
                )}
                {extracted.age != null && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Age</span>
                    {extracted.age}
                  </span>
                )}
                {extracted.sex && extracted.sex !== 'ALL' && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Sex</span>
                    {extracted.sex.charAt(0) + extracted.sex.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
              {!extracted.condition && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠ I couldn&apos;t determine the condition — please fill it in below.
                </p>
              )}
              <p className="text-xs text-parchment-600 mt-2 italic">
                Not right? Edit the form below or retype your description.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
