import { useState, useEffect } from 'react'
import { useNLP } from '../hooks/useNLP'
import { useClassifier } from '../hooks/useClassifier'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'
import { DEFAULT_CLASSIFY_PROMPT, parseVerdict } from '../utils/classifyTrial'
import { SAMPLE_TRIALS, USER_PRESETS } from './ClassificationHarness.fixtures'

// Normalize fixture-side expected values for binary agreement: POSSIBLE
// counts as LIKELY (both = "show this trial"). Keeps the fixture data
// informationally rich (3-class) while letting the binary model output
// be evaluated correctly.
function expectedBinary(expected) {
  if (expected === 'POSSIBLE') return 'LIKELY'
  return expected
}

const VERDICT_STYLES = {
  LIKELY:     'bg-signal-good-bg text-signal-good',
  POSSIBLE:   'bg-signal-warn-bg text-signal-warn',
  UNLIKELY:   'bg-parchment-200 text-parchment-700',
  PARSE_FAIL: 'bg-signal-bad-bg text-signal-bad',
  PENDING:    'bg-parchment-100 text-parchment-700',
}

export default function ClassificationHarness() {
  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )
  const model = NLP_MODELS[modelKey]
  const { status, progress, error, load, webGPUSupported } = useNLP()
  const { classifyOne, translateOne } = useClassifier()

  const [userDesc, setUserDesc] = useState(USER_PRESETS[0].text)
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_CLASSIFY_PROMPT)
  const [trialsJson, setTrialsJson] = useState(JSON.stringify(SAMPLE_TRIALS, null, 2))
  const [concurrency, setConcurrency] = useState(3)
  const [eligMax, setEligMax] = useState(1500)
  const [translateFirst, setTranslateFirst] = useState(false)
  const [translatedDesc, setTranslatedDesc] = useState(null)
  const [productionMode, setProductionMode] = useState(true)
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [startT, setStartT] = useState(0)
  const [, setTick] = useState(0)

  // Lightweight ticker so elapsed time updates while a run is in flight.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(t => t + 1), 250)
    return () => clearInterval(id)
  }, [running])

  function getProgressLabel() {
    if (!progress) return 'Loading model…'
    return progress.text || `Loading model… ${Math.round((progress.progress ?? 0) * 100)}%`
  }

  async function run() {
    let trials
    try {
      trials = JSON.parse(trialsJson)
      if (!Array.isArray(trials)) throw new Error('Not an array')
    } catch (e) {
      alert('Trials JSON is invalid: ' + e.message)
      return
    }

    setRunning(true)
    setStartT(performance.now())
    const initial = trials.map(trial => ({ trial, status: 'PENDING' }))
    setResults(initial)
    setTranslatedDesc(null)

    // Translate user description to English once before classification, so the
    // model anchors on a single language at inference time. Runs only once per
    // batch — amortized cost across all N trials.
    let effectiveUserDesc = userDesc
    if (translateFirst) {
      const translatePrompt = `Translate the following patient description into clear, clinical English. Preserve all medical and demographic facts (age, sex, condition, treatments, location). Do not add or remove information. Output ONLY the English translation, nothing else.

Patient description: ${userDesc}

English translation:`
      try {
        const { raw } = await translateOne(translatePrompt)
        effectiveUserDesc = (raw || '').trim().replace(/^["']|["']$/g, '')
        setTranslatedDesc(effectiveUserDesc)
      } catch (e) {
        alert('Translation failed: ' + (e?.message ?? 'unknown error'))
        setRunning(false)
        return
      }
    }

    const queue = trials.map((trial, idx) => ({ idx, trial }))
    const workersN = Math.min(concurrency, trials.length)

    async function worker() {
      while (queue.length) {
        const { idx, trial } = queue.shift()
        const elig = (trial.eligibility || '').slice(0, eligMax)
        const prompt = promptTemplate
          .replace('{{user}}', effectiveUserDesc)
          .replace('{{title}}', trial.title || trial.briefTitle || '')
          .replace('{{eligibility}}', elig)
        try {
          const { raw, latencyMs } = await classifyOne(prompt)
          const parsed = parseVerdict(raw)
          setResults(prev => {
            const next = [...prev]
            next[idx] = { trial, status: 'DONE', raw, latencyMs, ...parsed }
            return next
          })
        } catch (err) {
          setResults(prev => {
            const next = [...prev]
            next[idx] = {
              trial,
              status: 'DONE',
              raw: '',
              latencyMs: 0,
              verdict: 'PARSE_FAIL',
              reason: err?.message ?? 'classify error',
            }
            return next
          })
        }
      }
    }

    await Promise.all(Array.from({ length: workersN }, worker))
    setRunning(false)
  }

  function reset() {
    setTrialsJson(JSON.stringify(SAMPLE_TRIALS, null, 2))
    setResults([])
  }

  const [copyState, setCopyState] = useState('idle') // idle | copied | error
  async function copyMarkdown() {
    const md = buildMarkdownReport({
      userDesc,
      translatedDesc,
      translateFirst,
      productionMode,
      hiddenCount,
      promptTemplate,
      eligMax,
      modelLabel: model.label,
      results,
      stats: { done: done.length, total: results.length, elapsed, avgLat, maxLat, parseRate, parseFails, agreementPct, matches, withExpected: withExpected.length },
    })
    try {
      await navigator.clipboard.writeText(md)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2400)
    }
  }

  // ───────── stats ─────────
  const done = results.filter(r => r.status === 'DONE')
  const lats = done.map(r => r.latencyMs).filter(n => n != null)
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0
  const maxLat = lats.length ? Math.round(Math.max(...lats)) : 0
  const parseFails = done.filter(r => r.verdict === 'PARSE_FAIL').length
  const parseRate = done.length ? Math.round(((done.length - parseFails) / done.length) * 100) : 0
  const elapsed = startT ? ((performance.now() - startT) / 1000).toFixed(1) : '0.0'
  // Production mode hides trials the CT.gov API would never return for the
  // user's stated condition (e.g., melanoma trials in a breast-cancer search).
  // The headline agreement % then reflects what users would actually see,
  // not the model's behavior on stress-test inputs.
  const inScope = (r) => !productionMode || !r.trial.outOfScope
  const withExpected = done.filter(r => r.trial.expected && inScope(r))
  const matches = withExpected.filter(r => r.verdict === expectedBinary(r.trial.expected)).length
  const agreementPct = withExpected.length ? Math.round((matches / withExpected.length) * 100) : null
  const hiddenCount = done.filter(r => r.trial.outOfScope).length

  const canRun = status === 'ready' && !running

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-7 pb-20">
      <h1 className="font-serif font-semibold text-[28px] tracking-tight text-parchment-950 mb-1">
        Classification harness
      </h1>
      <p className="text-[13px] text-parchment-700 max-w-[640px] leading-relaxed mb-6">
        Validate the proposed Stage-1 classifier (LIKELY / POSSIBLE / UNLIKELY) against real
        ClinicalTrials.gov payloads using the on-device {model.label}. Pass criteria from the
        Handoff: parse rate ≥ 90%, avg latency &lt; 1.5s, agreement ≥ 80%.
      </p>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-iris-700 mb-1">model</div>
            <div className="font-mono text-[12px] text-parchment-900">
              {model.label} ({model.sizeLabel}) · status:{' '}
              <strong className={status === 'ready' ? 'text-signal-good' : 'text-parchment-700'}>
                {status}
              </strong>
              {status === 'downloading' && progress && (
                <span className="text-parchment-500"> · {Math.round((progress.progress ?? 0) * 100)}%</span>
              )}
            </div>
            {status === 'downloading' && (
              <p className="font-mono text-[11px] text-parchment-700 mt-1">{getProgressLabel()}</p>
            )}
            {!webGPUSupported && (
              <p className="text-[12px] text-signal-bad mt-1">WebGPU unavailable in this browser.</p>
            )}
            {error && <p className="text-[12px] text-signal-bad mt-1">{error}</p>}
          </div>
          {status !== 'ready' && status !== 'downloading' && webGPUSupported && (
            <button
              type="button"
              onClick={() => load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })}
              className="bg-iris-600 text-white px-4 py-2 rounded-md text-[13px] font-semibold hover:bg-iris-700"
            >
              Load model
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <h2 className="font-serif font-semibold text-base mb-3">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700">
                User description
              </label>
              <select
                value={USER_PRESETS.find(p => p.text === userDesc)?.id ?? 'custom'}
                onChange={e => {
                  const preset = USER_PRESETS.find(p => p.id === e.target.value)
                  if (preset) setUserDesc(preset.text)
                }}
                className="text-[11px] px-2 py-1 border border-parchment-300 rounded bg-white text-parchment-700"
                title="Swap the patient description to test multilingual handling and edge cases"
              >
                {!USER_PRESETS.some(p => p.text === userDesc) && (
                  <option value="custom">— custom —</option>
                )}
                {USER_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <textarea
              rows={3}
              value={userDesc}
              onChange={e => setUserDesc(e.target.value)}
              dir={userDesc.match(/[؀-ۿ]/) ? 'rtl' : 'ltr'}
              className="w-full text-[13px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
              Classify prompt template
            </label>
            <textarea
              rows={6}
              value={promptTemplate}
              onChange={e => setPromptTemplate(e.target.value)}
              className="w-full font-mono text-[12px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
            Trials (JSON array — fixture loaded by default)
          </label>
          <textarea
            rows={10}
            value={trialsJson}
            onChange={e => setTrialsJson(e.target.value)}
            className="w-full font-mono text-[11.5px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            type="button"
            disabled={!canRun}
            onClick={run}
            className="bg-iris-600 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-iris-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? `Running… (${done.length}/${results.length})` : 'Run classification'}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={running}
            className="border border-parchment-300 text-parchment-900 px-4 py-2 rounded-lg text-[12px] hover:bg-parchment-100 disabled:opacity-50"
          >
            Reset trials
          </button>
          <span
            className="inline-flex items-center gap-2 text-[11px] text-parchment-700"
            title="WebLLM's MLCEngine is single-threaded — parallel inference clobbers state. Requests serialize through a hook-level promise chain regardless of caller concurrency."
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.04em]">execution</span>
            serial (engine constraint)
          </span>
          <label
            className="inline-flex items-center gap-1.5 text-[12px] text-parchment-900 cursor-pointer"
            title="Translate the patient description to English once before classification. Runs only once per batch — adds ~1s amortized."
          >
            <input
              type="checkbox"
              checked={translateFirst}
              onChange={e => setTranslateFirst(e.target.checked)}
              disabled={running}
              className="accent-iris-500"
            />
            translate to English first
          </label>
          <label
            className="inline-flex items-center gap-1.5 text-[12px] text-parchment-900 cursor-pointer"
            title="Production mode: agreement % only counts trials the CT.gov API would actually return for the patient's condition. Out-of-scope stress-test trials (different cancers, unrelated diseases) are still classified and shown but excluded from the headline."
          >
            <input
              type="checkbox"
              checked={productionMode}
              onChange={e => setProductionMode(e.target.checked)}
              className="accent-iris-500"
            />
            production-realistic agreement
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] text-parchment-700">
            Eligibility max chars
            <input
              type="number"
              min={200}
              max={8000}
              step={100}
              value={eligMax}
              onChange={e => setEligMax(parseInt(e.target.value, 10) || 1500)}
              disabled={running}
              className="w-[90px] px-2 py-1 text-[12px] border border-parchment-300 rounded bg-white"
            />
          </label>
        </div>

        {translatedDesc && (
          <div className="mt-3 px-3 py-2.5 bg-iris-50 border border-iris-100 rounded-lg text-[12px] text-parchment-900 leading-relaxed">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-iris-700 mr-2">translated</span>
            {translatedDesc}
          </div>
        )}

        {(running || done.length > 0) && (
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-parchment-700 mt-3">
            <span><strong className="text-parchment-950">{done.length} / {results.length}</strong> done</span>
            <span>elapsed <strong className="text-parchment-950">{elapsed}s</strong></span>
            <span>avg latency <strong className="text-parchment-950">{avgLat}ms</strong></span>
            <span>max latency <strong className="text-parchment-950">{maxLat}ms</strong></span>
            <span>parse rate <strong className="text-parchment-950">{parseRate}%</strong></span>
            <span>parse fails <strong className="text-parchment-950">{parseFails}</strong></span>
            {done.length > 0 && !running && (
              <button
                type="button"
                onClick={copyMarkdown}
                className="ml-auto inline-flex items-center gap-1.5 border border-iris-300 text-iris-700 hover:bg-iris-50 px-2.5 py-1 rounded text-[11px] transition-colors"
                title="Copy a shareable markdown summary of this run to your clipboard"
              >
                {copyState === 'copied' ? '✓ copied' : copyState === 'error' ? 'copy failed' : 'copy results as markdown'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <h2 className="font-serif font-semibold text-base mb-3">Results</h2>
        {results.length === 0 ? (
          <p className="text-parchment-500 italic text-[13px] py-6 text-center">
            No results yet — click <strong>Run classification</strong>.
          </p>
        ) : (
          <ResultsTable rows={results} />
        )}
        {agreementPct != null && !running && (
          <div className="font-mono text-[11px] text-parchment-700 mt-3 px-3 py-2.5 bg-iris-50 border border-iris-100 rounded-lg leading-relaxed">
            <strong className="text-iris-700">Agreement with expected:</strong>{' '}
            {matches} / {withExpected.length} ({agreementPct}%)
            {productionMode && hiddenCount > 0 && (
              <span className="text-parchment-700">
                {' '}— {hiddenCount} out-of-scope trial{hiddenCount !== 1 ? 's' : ''} excluded
                (the CT.gov API would not return them for this condition).
              </span>
            )}
            {!productionMode && (
              <span className="text-parchment-700">
                {' '}— includes out-of-scope stress-test trials. Toggle <em>production-realistic</em> for the user-facing number.
              </span>
            )}
          </div>
        )}
      </div>

      <details className="text-[12px] text-parchment-700">
        <summary className="cursor-pointer font-mono text-iris-700">Pass criteria (from Handoff)</summary>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Parse rate ≥ 90% on 50+ real trials</li>
          <li>Avg latency &lt; 1.5s per trial on a mid-range laptop</li>
          <li>Agreement ≥ 80% on a labeled held-out set</li>
          <li>No catastrophic UNLIKELY false-negatives (a viable trial ranked as UNLIKELY)</li>
        </ul>
      </details>
    </div>
  )
}

function buildMarkdownReport({ userDesc, translatedDesc, translateFirst, productionMode, hiddenCount, promptTemplate, eligMax, modelLabel, results, stats }) {
  const escape = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
  const truncate = (s, n) => {
    const t = escape(s)
    return t.length > n ? t.slice(0, n - 1) + '…' : t
  }

  const lines = []
  lines.push('# Classification harness run')
  lines.push('')
  lines.push(`**Model:** ${modelLabel}`)
  lines.push(`**User description:** ${userDesc}`)
  lines.push(`**Translate-first:** ${translateFirst ? 'ON' : 'off'}`)
  if (translatedDesc) {
    lines.push(`**Translated to:** ${translatedDesc}`)
  }
  lines.push(`**Eligibility max chars:** ${eligMax}`)
  lines.push('')
  lines.push('## Stats')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Done | ${stats.done} / ${stats.total} |`)
  lines.push(`| Elapsed | ${stats.elapsed}s |`)
  lines.push(`| Avg latency | ${stats.avgLat}ms |`)
  lines.push(`| Max latency | ${stats.maxLat}ms |`)
  lines.push(`| Parse rate | ${stats.parseRate}% (${stats.parseFails} fails) |`)
  if (stats.agreementPct != null) {
    const note = productionMode
      ? ` — ${hiddenCount || 0} out-of-scope trial(s) excluded`
      : ' — includes out-of-scope stress-test trials'
    lines.push(`| Agreement | ${stats.matches} / ${stats.withExpected} (${stats.agreementPct}%)${note} |`)
  }
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push(`| Trial | NCT | Verdict | Expected | Match | Latency | Reason / Raw |`)
  lines.push(`|---|---|---|---|---|---|---|`)
  for (const r of results) {
    if (r.status !== 'DONE') continue
    const v = r.verdict || 'PARSE_FAIL'
    const exp = r.trial.expected || '—'
    const expBinary = r.trial.expected ? (r.trial.expected === 'POSSIBLE' ? 'LIKELY' : r.trial.expected) : null
    const match = expBinary ? (r.verdict === expBinary ? '✓' : '✗') : ''
    const latency = r.latencyMs != null ? `${Math.round(r.latencyMs)}ms` : '—'
    const reasonOrRaw = r.reason && r.reason !== '(no reason)' ? r.reason : `raw: ${r.raw || '—'}`
    lines.push(`| ${truncate(r.trial.title || r.trial.briefTitle || r.trial.nctId, 80)} | ${escape(r.trial.nctId || '')} | ${v} | ${exp} | ${match} | ${latency} | ${truncate(reasonOrRaw, 140)} |`)
  }
  lines.push('')
  lines.push('<details>')
  lines.push('<summary>Prompt template used</summary>')
  lines.push('')
  lines.push('```')
  lines.push(promptTemplate)
  lines.push('```')
  lines.push('</details>')
  return lines.join('\n')
}

function ResultsTable({ rows }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '38%' }}>
            Trial
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '14%' }}>
            Verdict
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '12%' }}>
            Latency
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200">
            Raw output / reason
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '12%' }}>
            Expected
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const verdict = r.status === 'PENDING' ? 'PENDING' : (r.verdict || 'PARSE_FAIL')
          const rawExpected = r.trial.expected
          // Display: keep original 3-class label so the fixture still reads
          // informationally; ✓/✗ uses binary mapping (POSSIBLE counts as LIKELY).
          const expected = rawExpected || '—'
          const match = r.verdict && rawExpected
            ? (r.verdict === expectedBinary(rawExpected) ? '✓' : '✗')
            : ''
          const matchColor = match === '✓' ? 'text-signal-good' : match === '✗' ? 'text-signal-bad' : 'text-parchment-500'
          return (
            <tr key={i}>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <div className="font-serif font-semibold text-parchment-950 text-[13.5px] leading-snug">
                  {r.trial.title || r.trial.briefTitle || r.trial.nctId}
                </div>
                <div className="font-mono text-[10.5px] text-parchment-500 mt-0.5">
                  {r.trial.nctId || ''}
                </div>
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full tracking-[0.04em] ${VERDICT_STYLES[verdict] ?? ''}`}>
                  {verdict}
                </span>
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top font-mono text-[12px] text-parchment-700">
                {r.latencyMs != null ? `${Math.round(r.latencyMs)}ms` : '—'}
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <div className="text-[12.5px] text-parchment-900 leading-relaxed">{r.reason || '—'}</div>
                {r.raw && r.raw !== r.reason && (
                  <div className="font-mono text-[11px] text-parchment-700 mt-1 whitespace-pre-wrap break-words max-w-[380px]">
                    raw: {r.raw}
                  </div>
                )}
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top font-mono text-[11px] text-parchment-700">
                {expected}
                {match && <span className={`ml-1.5 font-semibold ${matchColor}`}>{match}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
