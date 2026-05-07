import { useState, useEffect, useRef } from 'react'
import { useNLP } from '../hooks/useNLP'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'

const STORAGE_KEY = 'iris_nlp_enabled'

export default function NaturalLanguageInput({ onExtract, embedded = false }) {
  const [expanded, setExpanded] = useState(embedded)
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

  const { status, progress, error, webGPUSupported, load, extract, clearLocalData } = useNLP()

  const hasAutoLoaded = useRef(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState(null)
  // If the user submits while the model is still downloading, hold the
  // intent and auto-fire when status flips to ready. Lets typing happen
  // in parallel with the one-time download.
  const [pendingSubmit, setPendingSubmit] = useState(false)

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

  async function handleClearLocalData() {
    setClearError(null)
    setClearing(true)
    try {
      await clearLocalData(model.id)
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* private browsing */ }
      setConsented(false)
      setExtracted(null)
      setText('')
      setConfirmingClear(false)
      hasAutoLoaded.current = false
    } catch (err) {
      setClearError(err?.message ?? 'Could not clear local data')
    } finally {
      setClearing(false)
    }
  }

  async function runExtraction() {
    if (!text.trim()) return
    const fields = await extract(text.trim())
    setExtracted(fields)
    if (fields && typeof onExtract === 'function') {
      onExtract({ fields, description: text.trim() })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    if (status !== 'ready') {
      // Model still downloading (or in some other transient state) — queue
      // the submit so it auto-fires when ready.
      setPendingSubmit(true)
      return
    }
    setPendingSubmit(false)
    await runExtraction()
  }

  // Drain a queued submit the moment the model becomes ready.
  useEffect(() => {
    if (status !== 'ready') return
    if (!pendingSubmit) return
    if (!text.trim()) { setPendingSubmit(false); return }
    setPendingSubmit(false)
    runExtraction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pendingSubmit])

  function getProgressLabel() {
    if (!progress) return 'Downloading AI model…'
    if (progress.text) return progress.text
    return `Downloading AI model… ${Math.round((progress.progress ?? 0) * 100)}%`
  }

  const badgeLabel = !webGPUSupported ? 'Unavailable' : null
  const badgeClass = !webGPUSupported
    ? 'bg-parchment-200 text-parchment-700'
    : 'bg-iris-100 text-iris-700'

  const outerClass = embedded
    ? 'px-4 sm:px-7 pt-2 pb-4'
    : 'bg-parchment-50 border-b border-parchment-200 px-6 py-3'

  return (
    <div className={outerClass}>
      {!embedded && (
        <button
          type="button"
          className={[
            'inline-flex items-center gap-2 text-[12px] font-medium rounded-full px-3 py-1.5 transition-colors',
            expanded
              ? 'bg-parchment-100 text-parchment-950 border border-parchment-300'
              : 'text-parchment-700 hover:text-parchment-950 hover:bg-parchment-100 border border-transparent',
          ].join(' ')}
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-controls="nlp-panel"
        >
          <span>Describe in your own words</span>
          <span className={`font-mono text-[10px] px-1.5 py-px rounded-full ${badgeClass}`}>
            {badgeLabel ?? 'AI · on-device'}
          </span>
        </button>
      )}

      {expanded && (
        <div id="nlp-panel" className={embedded ? 'max-w-2xl' : 'mt-3 max-w-xl'}>
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
                className="bg-iris-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-iris-700"
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

          {/* Error state */}
          {status === 'error' && (
            <div className="bg-parchment-50 border border-parchment-400 rounded-md p-3 mb-3">
              <p className="text-sm text-parchment-900">
                Something went wrong —{' '}
                <button type="button" onClick={handleConsent} className="underline">
                  try again
                </button>
              </p>
            </div>
          )}

          {/* Input — available as soon as consent is given. The textarea
              accepts typing while the model downloads in the background; the
              submit button enables once status === 'ready'. If the user hits
              submit during download, we queue and auto-fire on ready. */}
          {webGPUSupported && consented && (status === 'downloading' || status === 'ready' || status === 'extracting') && (
            <>
              <form onSubmit={handleSubmit}>
                <div className="bg-white border border-parchment-300 rounded-xl shadow-sm flex items-start gap-3 px-4 py-3.5">
                  <svg
                    width="18" height="18" viewBox="0 0 20 20" fill="none"
                    className="text-parchment-700 mt-1 shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <textarea
                    rows={2}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="e.g. 52-year-old woman in Brooklyn with triple negative breast cancer, already did chemo"
                    className="flex-1 text-[15px] text-parchment-950 leading-snug resize-none focus:outline-none placeholder:text-parchment-500 bg-transparent"
                    aria-label="Natural language search"
                    disabled={status === 'extracting'}
                  />
                  <button
                    type="submit"
                    disabled={!text.trim() || status === 'extracting'}
                    className="bg-iris-600 text-white px-3.5 py-2 rounded-md text-[13px] font-semibold hover:bg-iris-700 disabled:opacity-50 shrink-0"
                  >
                    {status === 'extracting'
                      ? 'Extracting…'
                      : pendingSubmit
                        ? 'Queued…'
                        : status === 'downloading'
                          ? 'Run when ready'
                          : 'Find trials'}
                  </button>
                </div>

                {status === 'downloading' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="font-mono text-[11px] text-parchment-700">
                        {getProgressLabel()}
                        {pendingSubmit && (
                          <span className="text-iris-700"> · search queued, runs when ready</span>
                        )}
                      </p>
                      <p className="font-mono text-[11px] text-parchment-500 shrink-0">one-time</p>
                    </div>
                    <div
                      className="bg-parchment-200 rounded-full h-1 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
                    >
                      <div
                        className="bg-iris-500 h-1 rounded-full transition-all"
                        style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {status !== 'downloading' && (
                  <p className="mt-2 font-mono text-[11px] text-parchment-700">
                    IRIS extracts condition, location, age, and other details automatically.
                    {' '}<span className="text-parchment-500">model: {model.label}</span>
                  </p>
                )}
              </form>

              {/* Clear local data — the model is the only thing IRIS stores
                  locally, so this returns the user to a fresh state. */}
              <div className="mt-4 pt-3 border-t border-parchment-300 text-xs">
                {!confirmingClear && (
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(true)}
                    disabled={status === 'extracting'}
                    className="text-parchment-700 underline hover:text-parchment-950 disabled:opacity-50"
                  >
                    Clear local data ({model.sizeLabel})
                  </button>
                )}
                {confirmingClear && (
                  <div className="bg-parchment-50 border border-parchment-300 rounded-md p-3">
                    <p className="text-parchment-900 mb-1">
                      Delete the AI model from your browser?
                    </p>
                    <p className="text-parchment-700 mb-2">
                      The model ({model.sizeLabel}) is the only data IRIS stores locally. After
                      deleting, you can re-enable the natural-language feature later — it will
                      re-download the model.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleClearLocalData}
                        disabled={clearing}
                        className="bg-iris-600 text-white px-3 py-1.5 rounded-md font-semibold hover:bg-iris-700 disabled:opacity-50"
                      >
                        {clearing ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setConfirmingClear(false); setClearError(null) }}
                        disabled={clearing}
                        className="border border-parchment-400 text-parchment-800 px-3 py-1.5 rounded-md hover:text-parchment-950 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    {clearError && (
                      <p className="text-red-700 mt-2">Couldn&apos;t delete: {clearError}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Understood chips */}
          {extracted && status === 'ready' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-parchment-700">understood:</span>
              {[
                ['condition', extracted.condition],
                ['location', extracted.location],
                ['age', extracted.age],
                ['sex', extracted.sex && extracted.sex !== 'ALL'
                  ? extracted.sex.charAt(0) + extracted.sex.slice(1).toLowerCase()
                  : null],
              ].filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 bg-white border border-parchment-300 rounded-md px-2 py-0.5 text-[12px]"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-parchment-500">{k}</span>
                  <span className="text-parchment-950 font-medium">{v}</span>
                </span>
              ))}
              {!extracted.condition && (
                <span className="text-[12px] text-amber-700">
                  ⚠ couldn&apos;t determine condition — fill below
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
