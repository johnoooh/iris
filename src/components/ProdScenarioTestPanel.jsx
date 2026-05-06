import { Fragment, useEffect, useRef, useState } from 'react'
import { useNLP } from '../hooks/useNLP'
import { useSimplifier } from '../hooks/useSimplifier'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'
import { buildQuery, parseTrials } from '../utils/apiHelpers'
import {
  detectInputLanguage,
  outputLanguageFor,
  SUPPORTED_SIMPLIFICATION_LANGUAGES,
} from '../utils/detectInputLanguage'

// Twenty production scenarios from test-scenarios.md. Kept inline so the
// panel is self-contained — it's a dev-only tool, lazy-loaded, and tree-
// shaken from production builds.
const PROD_PROMPTS = [
  { id: 'E1',  lang: 'English', text: "I'm 58 years old with breast cancer in Boston" },
  { id: 'E2',  lang: 'English', text: "I'm a 52-year-old with type 2 diabetes looking for trials in Miami" },
  { id: 'E3',  lang: 'English', text: "I'm 74, I have early-stage Alzheimer's disease, and I live in Seattle. I'm interested in any new treatments." },
  { id: 'E4',  lang: 'English', text: "I'm 65 with metastatic melanoma. Looking for immunotherapy trials in Houston." },
  { id: 'E5',  lang: 'English', text: 'Stage 4 pancreatic cancer, age 67, Chicago' },
  { id: 'E6',  lang: 'English', text: "My 8-year-old daughter has acute lymphoblastic leukemia and we're in Philadelphia" },
  { id: 'E7',  lang: 'English', text: '30s, neurofibromatosis type 1, NYC' },
  { id: 'E8',  lang: 'English', text: "I'm 28 and have treatment-resistant depression. I live near Denver." },
  { id: 'E9',  lang: 'English', text: '67-year-old man with heart failure and atrial fibrillation in Atlanta' },
  { id: 'E10', lang: 'English', text: 'Looking for trials about kidney problems' },

  { id: 'S1',  lang: 'Spanish', text: 'Tengo 58 años y cáncer de mama. Vivo en Boston.' },
  { id: 'S2',  lang: 'Spanish', text: 'Soy una mujer de 52 años con diabetes tipo 2 en Miami.' },
  { id: 'S3',  lang: 'Spanish', text: 'Tengo 74 años, vivo en Seattle, y me diagnosticaron Alzheimer en etapa temprana.' },
  { id: 'S4',  lang: 'Spanish', text: 'Tengo 65 años y melanoma metastásico. Busco ensayos de inmunoterapia en Houston.' },
  { id: 'S5',  lang: 'Spanish', text: 'Cáncer de páncreas en etapa 4, 67 años, Chicago.' },
  { id: 'S6',  lang: 'Spanish', text: 'Mi hija de 8 años tiene leucemia linfoblástica aguda. Estamos en Filadelfia.' },
  { id: 'S7',  lang: 'Spanish', text: 'Treinta y pocos años, neurofibromatosis tipo 1, Nueva York.' },
  { id: 'S8',  lang: 'Spanish', text: 'Tengo 28 años y depresión resistente al tratamiento. Vivo cerca de Denver.' },
  { id: 'S9',  lang: 'Spanish', text: 'Hombre de 67 años con insuficiencia cardíaca y fibrilación auricular en Atlanta.' },
  { id: 'S10', lang: 'Spanish', text: 'Busco ensayos sobre problemas renales.' },
]

const REJECTED_ADDRESSTYPES = new Set(['state', 'country', 'region', 'province'])

async function geocode(location) {
  if (!location) return null
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'IRIS-ClinicalTrialFinder/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.length) return null
    const hit = data[0]
    if (REJECTED_ADDRESSTYPES.has(hit.addresstype)) return null
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name }
  } catch { return null }
}

export default function ProdScenarioTestPanel() {
  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )
  const model = NLP_MODELS[modelKey]
  const { status, progress, error, webGPUSupported, load, extract } = useNLP()

  // useSimplifier needs userDescription/extractedFields hoisted at hook level
  // for assess_fit. We don't run assess_fit here (only summarize), so pass
  // null for extractedFields — enqueueAssessFit no-ops on a null value.
  const { states: simplifyStates, enqueueSummarize, resetCache: resetSimplify } = useSimplifier({
    modelKey,
    userDescription: '',
    extractedFields: null,
  })

  const [rows, setRows] = useState({})           // promptId -> { fields, raw, lang, supported, coords, url, resultCount, topTrial, extractMs, searchError }
  const [phase, setPhase] = useState('idle')     // 'idle' | 'extracting' | 'searching' | 'simplifying' | 'done'
  const [currentId, setCurrentId] = useState(null)
  const simplifyStartRef = useRef({})            // promptId -> performance.now() when summarize was enqueued

  function handleLoad() {
    load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })
  }

  async function runAll() {
    setRows({})
    resetSimplify()
    simplifyStartRef.current = {}
    setPhase('extracting')

    // Pass 1: extract + search for every prompt. Sequential because the worker
    // serializes anyway, and we want clean per-row latency numbers.
    const acc = {}
    for (const p of PROD_PROMPTS) {
      setCurrentId(p.id)

      const t0 = performance.now()
      let fields = null
      try {
        fields = await extract(p.text)
      } catch (err) {
        acc[p.id] = { extractError: err?.message ?? String(err) }
        setRows(r => ({ ...r, [p.id]: acc[p.id] }))
        continue
      }
      const extractMs = Math.round(performance.now() - t0)

      const lang = detectInputLanguage(p.text)
      const outputLanguage = outputLanguageFor(lang)
      const supported = SUPPORTED_SIMPLIFICATION_LANGUAGES.has(lang)

      const coords = fields?.location ? await geocode(fields.location) : null

      const searchParams = {
        condition: fields?.condition ?? null,
        location: fields?.location ?? null,
        age: fields?.age ?? null,
        sex: fields?.sex ?? 'ALL',
        phases: fields?.phases ?? [],
        status: 'RECRUITING',
        radius: 50,
      }

      let url = ''
      let resultCount = 0
      let topTrial = null
      let searchError = null
      if (searchParams.condition) {
        try {
          url = buildQuery(searchParams, coords, null)
          const res = await fetch(url)
          if (!res.ok) throw new Error(`API ${res.status}`)
          const data = await res.json()
          resultCount = data.totalCount ?? 0
          const parsed = parseTrials(data.studies ?? [])
          topTrial = parsed[0] ?? null
        } catch (err) {
          searchError = err?.message ?? String(err)
        }
      }

      acc[p.id] = {
        fields, lang, outputLanguage, supported,
        coords, url, resultCount, topTrial, extractMs, searchError,
      }
      setRows(r => ({ ...r, [p.id]: acc[p.id] }))
    }

    // Pass 2: enqueue summarize for every row that has a top trial in a
    // supported language. Tasks queue through the shared worker.
    setPhase('simplifying')
    setCurrentId(null)
    for (const p of PROD_PROMPTS) {
      const row = acc[p.id]
      if (!row?.topTrial || !row.supported) continue
      // Use a synthesised nctId per prompt so re-running with a different
      // language for the same trial doesn't dedupe.
      const taggedTrial = { ...row.topTrial, nctId: `${row.topTrial.nctId}__${p.id}` }
      simplifyStartRef.current[p.id] = performance.now()
      acc[p.id].simplifyKey = taggedTrial.nctId
      enqueueSummarize(taggedTrial, { outputLanguage: row.outputLanguage })
    }
    // Reflect the simplifyKey assignments into state so the table can read them.
    setRows(prev => {
      const next = { ...prev }
      for (const p of PROD_PROMPTS) if (acc[p.id]) next[p.id] = acc[p.id]
      return next
    })

    setPhase('done')
  }

  // Track per-prompt simplify latency.
  const [simplifyMs, setSimplifyMs] = useState({})
  useEffect(() => {
    setSimplifyMs(prev => {
      const next = { ...prev }
      for (const p of PROD_PROMPTS) {
        const row = rows[p.id]
        if (!row?.simplifyKey) continue
        const s = simplifyStates.get(row.simplifyKey)?.summarize
        if (!s) continue
        if ((s.status === 'complete' || s.status === 'error') &&
            simplifyStartRef.current[p.id] && next[p.id] == null) {
          next[p.id] = Math.round(performance.now() - simplifyStartRef.current[p.id])
        }
      }
      return next
    })
  }, [rows, simplifyStates])

  function copyAsMarkdown() {
    const lines = [
      `### Production scenario test — model: ${model.label} (${model.id})`,
      '',
    ]
    for (const p of PROD_PROMPTS) {
      const row = rows[p.id]
      if (!row) continue
      lines.push(`#### ${p.id} (${p.lang}) — "${p.text}"`)
      if (row.extractError) {
        lines.push(`- Extract ERROR: ${row.extractError}`)
        lines.push('')
        continue
      }
      const f = row.fields ?? {}
      lines.push(`- Extract: condition=\`${f.condition ?? '—'}\` · location=\`${f.location ?? '—'}\` · age=\`${f.age ?? '—'}\` · sex=\`${f.sex ?? '—'}\` · phases=\`[${(f.phases ?? []).join(',')}]\` · ${row.extractMs}ms`)
      lines.push(`- Detected lang: \`${row.lang}\` (simplification ${row.supported ? 'supported' : 'skipped'}, output → \`${row.outputLanguage}\`)`)
      if (row.coords) lines.push(`- Geocode: ${row.coords.displayName} (${row.coords.lat.toFixed(3)}, ${row.coords.lng.toFixed(3)})`)
      else if (f.location) lines.push(`- Geocode: rejected (state-level or no match) → search uses \`query.locn=${f.location}\``)
      if (row.url) lines.push(`- URL: ${row.url}`)
      if (row.searchError) lines.push(`- Search ERROR: ${row.searchError}`)
      else lines.push(`- Results: ${row.resultCount}`)
      if (row.topTrial) lines.push(`- Top trial: ${row.topTrial.nctId} — ${row.topTrial.title}`)
      const sState = row.simplifyKey ? simplifyStates.get(row.simplifyKey)?.summarize : null
      if (sState) {
        lines.push(`- Simplify (${row.outputLanguage}, ${sState.status}, ${simplifyMs[p.id] ?? '—'}ms):`)
        if (sState.summary) lines.push(`  - SUMMARY: ${sState.summary.replace(/\n/g, ' ')}`)
        if (sState.eligibility) lines.push(`  - ELIGIBILITY: ${sState.eligibility.replace(/\n/g, ' ')}`)
      }
      lines.push('')
    }
    navigator.clipboard?.writeText(lines.join('\n'))
  }

  if (!webGPUSupported) {
    return (
      <div className="p-6 text-sm text-parchment-900">
        WebGPU not supported in this browser. Use Chrome 113+, Edge 113+, or Safari 17.4+.
      </div>
    )
  }

  const completedExtractions = Object.values(rows).filter(r => r && !r.extractError).length

  return (
    <div className="p-6 max-w-6xl mx-auto text-sm text-parchment-950">
      <h2 className="text-lg font-bold mb-2">Production Scenario Test</h2>
      <p className="mb-3 text-parchment-700">
        Runs 20 patient prompts (10 English + 10 Spanish) end-to-end: extraction → geocode → ClinicalTrials.gov search → simplification of top trial in the user's language.
        Model: <code>{model.label}</code> ({model.id}). Switch with <code>?model=gemma</code> or <code>?model=qwen3</code>. Status: <code>{status}</code>
        {progress?.progress != null && ` — ${Math.round(progress.progress * 100)}%`}
      </p>

      {error && <p className="text-red-700 mb-2">Error: {error}</p>}

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={handleLoad}
          disabled={status === 'downloading' || status === 'ready' || status === 'extracting'}
          className="bg-parchment-800 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          {status === 'ready' ? 'Model loaded' : status === 'downloading' ? 'Loading…' : 'Load model'}
        </button>
        <button
          type="button"
          onClick={runAll}
          disabled={status !== 'ready' || phase === 'extracting' || phase === 'simplifying'}
          className="bg-parchment-700 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          {phase === 'extracting' ? `Extracting… (${currentId ?? ''})` :
           phase === 'simplifying' ? 'Simplifying queued trials…' :
           phase === 'done' ? 'Re-run all 20 scenarios' : 'Run all 20 scenarios'}
        </button>
        <button
          type="button"
          onClick={copyAsMarkdown}
          disabled={completedExtractions === 0}
          className="border border-parchment-700 px-3 py-2 rounded-md disabled:opacity-50"
        >
          Copy results as markdown
        </button>
        <p className="text-xs text-parchment-700 self-center">
          Phase: <code>{phase}</code> · {completedExtractions}/{PROD_PROMPTS.length} extracted
        </p>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-parchment-100 text-left">
            <th className="border border-parchment-300 px-2 py-1">ID</th>
            <th className="border border-parchment-300 px-2 py-1">Lang</th>
            <th className="border border-parchment-300 px-2 py-1">Prompt</th>
            <th className="border border-parchment-300 px-2 py-1">Condition</th>
            <th className="border border-parchment-300 px-2 py-1">Location</th>
            <th className="border border-parchment-300 px-2 py-1">Geo</th>
            <th className="border border-parchment-300 px-2 py-1">Age</th>
            <th className="border border-parchment-300 px-2 py-1">Sex</th>
            <th className="border border-parchment-300 px-2 py-1">Hits</th>
            <th className="border border-parchment-300 px-2 py-1">Ext ms</th>
            <th className="border border-parchment-300 px-2 py-1">Simp ms</th>
            <th className="border border-parchment-300 px-2 py-1">Out lang</th>
          </tr>
        </thead>
        <tbody>
          {PROD_PROMPTS.map(p => {
            const r = rows[p.id]
            const f = r?.fields ?? {}
            const isCurrent = currentId === p.id
            const sState = r?.simplifyKey ? simplifyStates.get(r.simplifyKey)?.summarize : null
            const dirAttr = p.lang === 'Arabic' ? 'rtl' : 'ltr'
            const langDir = r?.outputLanguage === 'Arabic' ? 'rtl' : 'ltr'

            return (
              <Fragment key={p.id}>
                <tr className={isCurrent ? 'bg-amber-100' : ''}>
                  <td className="border border-parchment-300 px-2 py-1 font-mono">{p.id}</td>
                  <td className="border border-parchment-300 px-2 py-1">{p.lang}</td>
                  <td className="border border-parchment-300 px-2 py-1 max-w-xs" dir={dirAttr}>{p.text}</td>
                  <td className="border border-parchment-300 px-2 py-1">{f.condition ?? (r?.extractError ? <span className="text-red-700">err</span> : '—')}</td>
                  <td className="border border-parchment-300 px-2 py-1">{f.location ?? '—'}</td>
                  <td className="border border-parchment-300 px-2 py-1 text-center" title={r?.coords?.displayName ?? ''}>
                    {r?.coords ? '✓' : (f.location ? '✗' : '—')}
                  </td>
                  <td className="border border-parchment-300 px-2 py-1">{f.age ?? '—'}</td>
                  <td className="border border-parchment-300 px-2 py-1">{f.sex ?? '—'}</td>
                  <td className="border border-parchment-300 px-2 py-1 text-right">
                    {r?.searchError ? <span className="text-red-700">err</span> : (r?.resultCount ?? '—')}
                  </td>
                  <td className="border border-parchment-300 px-2 py-1 text-right">{r?.extractMs ?? '—'}</td>
                  <td className="border border-parchment-300 px-2 py-1 text-right">
                    {simplifyMs[p.id] ?? (sState ? <span className="italic text-parchment-600">{sState.status}</span> : '—')}
                  </td>
                  <td className="border border-parchment-300 px-2 py-1">{r?.outputLanguage ?? '—'}</td>
                </tr>
                {r && (
                  <tr>
                    <td colSpan={12} className="border border-parchment-300 px-3 py-2 bg-parchment-50">
                      <details>
                        <summary className="cursor-pointer text-parchment-700 text-[11px]">
                          Details — top trial, raw extraction, simplification, search URL
                        </summary>
                        <div className="mt-2 space-y-3 text-[12px]">
                          {r.searchError && <p className="text-red-700">Search error: {r.searchError}</p>}

                          {r.url && (
                            <p className="break-all"><strong>URL:</strong> <a href={r.url} target="_blank" rel="noreferrer" className="underline text-parchment-800">{r.url}</a></p>
                          )}

                          {r.coords && (
                            <p><strong>Geocode:</strong> {r.coords.displayName} ({r.coords.lat.toFixed(3)}, {r.coords.lng.toFixed(3)})</p>
                          )}
                          {!r.coords && f.location && (
                            <p><strong>Geocode:</strong> rejected (state-level or no match) — search falls back to <code>query.locn=&quot;{f.location}&quot;</code></p>
                          )}

                          {r.topTrial && (
                            <div>
                              <p><strong>Top trial:</strong> <a href={r.topTrial.ctGovUrl} target="_blank" rel="noreferrer" className="underline">{r.topTrial.nctId}</a> — {r.topTrial.title}</p>
                              <p className="text-parchment-700 italic mt-1">Source brief summary:</p>
                              <p className="whitespace-pre-wrap mt-0.5">{r.topTrial.summary}</p>
                            </div>
                          )}

                          {sState && (
                            <div className="border-l-2 border-parchment-400 pl-3">
                              <p className="text-[11px] uppercase tracking-wide text-parchment-700">
                                Plain-language summary ({r.outputLanguage}, {sState.status}, {simplifyMs[p.id] ?? '—'}ms, {sState.buffer?.length ?? 0} chars)
                              </p>
                              {sState.summary && (
                                <p className="whitespace-pre-wrap mt-1" dir={langDir}>{sState.summary}</p>
                              )}
                              {sState.eligibility && (
                                <>
                                  <p className="text-[11px] uppercase tracking-wide text-parchment-700 mt-2">Plain-language eligibility</p>
                                  <p className="whitespace-pre-wrap mt-1" dir={langDir}>{sState.eligibility}</p>
                                </>
                              )}
                              {sState.error && <p className="text-red-700 mt-1">Simplify error: {sState.error}</p>}
                            </div>
                          )}

                        </div>
                      </details>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-parchment-700">
        Walk through: 1. <strong>Load model</strong> (one-time download). 2. <strong>Run all 20 scenarios</strong> — extracts + searches all 20 first (~2 min on Gemma 2 2B), then queues simplification of each top trial. The simplify pass takes longer (~10–15s per trial × 20 = several minutes). 3. Click <strong>Copy results as markdown</strong> when done.
      </p>
    </div>
  )
}
