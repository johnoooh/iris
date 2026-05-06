import { useEffect, useMemo, useRef, useState } from 'react'
import { useNLP } from '../hooks/useNLP'
import { useSimplifier } from '../hooks/useSimplifier'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'

const TEST_PROMPTS = [
  { id: 'breast-en',     lang: 'English',  expectedCondition: 'breast cancer',       expectedLocation: 'Boston',  expectedAge: 58, text: "I'm 58 years old with breast cancer in Boston" },
  { id: 'breast-es',     lang: 'Spanish',  expectedCondition: 'breast cancer',       expectedLocation: 'Boston',  expectedAge: 58, text: 'Tengo 58 años y cáncer de mama en Boston' },
  { id: 'breast-zh',     lang: 'Mandarin', expectedCondition: 'breast cancer',       expectedLocation: 'Boston',  expectedAge: 58, text: '我58岁,在波士顿患有乳腺癌' },
  { id: 'breast-ar',     lang: 'Arabic',   expectedCondition: 'breast cancer',       expectedLocation: 'Boston',  expectedAge: 58, text: 'عمري 58 عامًا ولدي سرطان الثدي في بوسطن' },

  { id: 'diabetes-en',   lang: 'English',  expectedCondition: 'type 2 diabetes',     expectedLocation: 'Miami',   expectedAge: 52, text: "I'm 52 with type 2 diabetes in Miami" },
  { id: 'diabetes-es',   lang: 'Spanish',  expectedCondition: 'type 2 diabetes',     expectedLocation: 'Miami',   expectedAge: 52, text: 'Tengo 52 años y diabetes tipo 2 en Miami' },
  { id: 'diabetes-zh',   lang: 'Mandarin', expectedCondition: 'type 2 diabetes',     expectedLocation: 'Miami',   expectedAge: 52, text: '我52岁,在迈阿密患有2型糖尿病' },
  { id: 'diabetes-ar',   lang: 'Arabic',   expectedCondition: 'type 2 diabetes',     expectedLocation: 'Miami',   expectedAge: 52, text: 'عمري 52 عامًا ولدي مرض السكري من النوع 2 في ميامي' },

  { id: 'alz-en',        lang: 'English',  expectedCondition: 'Alzheimer',           expectedLocation: 'Seattle', expectedAge: 74, text: "I'm 74, I have Alzheimer's, and I live in Seattle" },
  { id: 'alz-es',        lang: 'Spanish',  expectedCondition: 'Alzheimer',           expectedLocation: 'Seattle', expectedAge: 74, text: 'Tengo 74 años, tengo Alzheimer y vivo en Seattle' },
  { id: 'alz-zh',        lang: 'Mandarin', expectedCondition: 'Alzheimer',           expectedLocation: 'Seattle', expectedAge: 74, text: '我74岁,患有阿尔茨海默病,住在西雅图' },
  { id: 'alz-ar',        lang: 'Arabic',   expectedCondition: 'Alzheimer',           expectedLocation: 'Seattle', expectedAge: 74, text: 'عمري 74 عامًا ولدي مرض الزهايمر وأعيش في سياتل' },

  { id: 'melanoma-en',   lang: 'English',  expectedCondition: 'metastatic melanoma', expectedLocation: 'Houston', expectedAge: 65, text: "I'm 65 years old with metastatic melanoma in Houston" },
  { id: 'melanoma-es',   lang: 'Spanish',  expectedCondition: 'metastatic melanoma', expectedLocation: 'Houston', expectedAge: 65, text: 'Tengo 65 años y melanoma metastásico en Houston' },
  { id: 'melanoma-zh',   lang: 'Mandarin', expectedCondition: 'metastatic melanoma', expectedLocation: 'Houston', expectedAge: 65, text: '我65岁,在休斯敦患有转移性黑色素瘤' },
  { id: 'melanoma-ar',   lang: 'Arabic',   expectedCondition: 'metastatic melanoma', expectedLocation: 'Houston', expectedAge: 65, text: 'عمري 65 عامًا ولدي ورم ميلانيني نقيلي في هيوستن' },

  { id: 'pancreatic-en', lang: 'English',  expectedCondition: 'pancreatic cancer',   expectedLocation: 'Chicago', expectedAge: 67, text: "I'm 67 with stage 4 pancreatic cancer in Chicago" },
  { id: 'pancreatic-es', lang: 'Spanish',  expectedCondition: 'pancreatic cancer',   expectedLocation: 'Chicago', expectedAge: 67, text: 'Tengo 67 años y cáncer de páncreas en etapa 4 en Chicago' },
  { id: 'pancreatic-zh', lang: 'Mandarin', expectedCondition: 'pancreatic cancer',   expectedLocation: 'Chicago', expectedAge: 67, text: '我67岁,在芝加哥患有4期胰腺癌' },
  { id: 'pancreatic-ar', lang: 'Arabic',   expectedCondition: 'pancreatic cancer',   expectedLocation: 'Chicago', expectedAge: 67, text: 'عمري 67 عامًا ولدي سرطان البنكرياس في المرحلة 4 في شيكاغو' },
]

// Hardcoded trial fixture for the simplification test. Pulled from a real
// recruiting breast-cancer trial (NCT04221594) and trimmed to representative
// length so the test is deterministic and works offline.
const FIXTURE_TRIAL = {
  nctId: 'NCT04221594-FIXTURE',
  title: 'A Study of Trastuzumab Deruxtecan in Participants with HER2-Low Breast Cancer',
  summary:
    'This is a randomized, multicenter, open-label, Phase 3 study to evaluate the efficacy and safety of trastuzumab deruxtecan versus investigator\'s choice of chemotherapy for HER2-low, hormone receptor-positive breast cancer that has progressed on endocrine therapy. Participants will be assigned to receive either trastuzumab deruxtecan intravenously every 3 weeks, or one of capecitabine, paclitaxel, or nab-paclitaxel per investigator selection. The primary endpoint is progression-free survival.',
  eligibility: {
    criteria:
      'Inclusion Criteria:\n- Pathologically documented breast cancer that is unresectable or metastatic\n- HER2-low expression (IHC 1+ or IHC 2+/ISH-)\n- Hormone receptor (HR)-positive disease\n- At least one prior line of endocrine therapy in the metastatic setting\n- ECOG performance status 0 or 1\n- Adequate organ and bone marrow function\n\nExclusion Criteria:\n- HER2-positive disease (IHC 3+ or ISH+)\n- More than two prior lines of chemotherapy in the metastatic setting\n- History of non-infectious interstitial lung disease (ILD)/pneumonitis requiring steroids\n- Active CNS metastases\n- Known active hepatitis B or C',
  },
}

function scoreCondition(actual, expected) {
  if (!actual) return '✗'
  const a = actual.toLowerCase()
  const e = expected.toLowerCase()
  if (a === e) return '✓'
  if (a.includes(e) || e.includes(a)) return '~'
  const aTokens = new Set(a.split(/\s+/))
  const eTokens = e.split(/\s+/)
  const hits = eTokens.filter(t => aTokens.has(t)).length
  if (hits >= Math.ceil(eTokens.length / 2)) return '~'
  return '✗'
}

function scoreLocation(actual, expected) {
  if (!actual) return '✗'
  return actual.toLowerCase().includes(expected.toLowerCase()) ? '✓' : '✗'
}

function scoreAge(actual, expected) {
  if (actual == null) return '✗'
  return actual === expected ? '✓' : '✗'
}

export default function NLPTestPanel() {
  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )
  const model = NLP_MODELS[modelKey]
  const { status, progress, error, webGPUSupported, load, extract } = useNLP()

  // Simplifier driven by the same shared worker. We pass a synthesised
  // extractedFields so assess_fit could also be exercised later if needed.
  const simplifyExtractedFields = useMemo(() => ({ condition: 'breast cancer', age: 58, sex: 'FEMALE' }), [])
  const simplifyUserDescription = "I'm 58 years old with breast cancer in Boston"
  const { states: simplifyStates, enqueueSummarize, resetCache: resetSimplify } = useSimplifier({
    modelKey,
    userDescription: simplifyUserDescription,
    extractedFields: simplifyExtractedFields,
  })

  const [results, setResults] = useState({})
  const [running, setRunning] = useState(false)
  const [currentId, setCurrentId] = useState(null)

  // Track simplification timing locally since useSimplifier doesn't expose it.
  const simplifyStartRef = useRef(null)
  const [simplifyMs, setSimplifyMs] = useState(null)

  // Multilingual simplification: same fixture trial, output in 4 languages.
  // Each gets a synthetic nctId so useSimplifier treats them as separate tasks.
  const SIMPLIFY_LANGUAGES = [
    { code: 'en', label: 'English',  outputLanguage: 'English' },
    { code: 'es', label: 'Spanish',  outputLanguage: 'Spanish' },
    { code: 'zh', label: 'Mandarin', outputLanguage: 'Mandarin Chinese' },
    { code: 'ar', label: 'Arabic',   outputLanguage: 'Arabic' },
  ]
  const langStartRef = useRef({})
  const [langMs, setLangMs] = useState({})

  function handleLoad() {
    load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })
  }

  async function runOne(prompt) {
    setCurrentId(prompt.id)
    const t0 = performance.now()
    try {
      const fields = await extract(prompt.text)
      const ms = Math.round(performance.now() - t0)
      setResults(r => ({ ...r, [prompt.id]: { fields, ms } }))
    } catch (err) {
      const ms = Math.round(performance.now() - t0)
      setResults(r => ({ ...r, [prompt.id]: { error: err?.message ?? String(err), ms } }))
    }
  }

  async function runAll() {
    setRunning(true)
    setResults({})
    for (const prompt of TEST_PROMPTS) {
      await runOne(prompt)
    }
    setCurrentId(null)
    setRunning(false)
  }

  function runSimplify() {
    resetSimplify()
    simplifyStartRef.current = performance.now()
    setSimplifyMs(null)
    setLangMs({})
    langStartRef.current = {}
    enqueueSummarize(FIXTURE_TRIAL)
  }

  function runMultilingualSimplify() {
    resetSimplify()
    setSimplifyMs(null)
    setLangMs({})
    langStartRef.current = {}
    const now = performance.now()
    for (const lang of SIMPLIFY_LANGUAGES) {
      const trial = { ...FIXTURE_TRIAL, nctId: `${FIXTURE_TRIAL.nctId}-${lang.code}` }
      langStartRef.current[lang.code] = now
      enqueueSummarize(trial, { outputLanguage: lang.outputLanguage })
    }
  }

  // Track when the summarize task finishes to record total wall-clock latency.
  const fixtureState = simplifyStates.get(FIXTURE_TRIAL.nctId)?.summarize
  useEffect(() => {
    if (!fixtureState) return
    if ((fixtureState.status === 'complete' || fixtureState.status === 'error') && simplifyStartRef.current) {
      setSimplifyMs(Math.round(performance.now() - simplifyStartRef.current))
      simplifyStartRef.current = null
    }
  }, [fixtureState?.status])

  // Per-language simplification states + latency tracking.
  const langStates = SIMPLIFY_LANGUAGES.map(lang => ({
    lang,
    state: simplifyStates.get(`${FIXTURE_TRIAL.nctId}-${lang.code}`)?.summarize,
  }))
  useEffect(() => {
    setLangMs(prev => {
      const next = { ...prev }
      for (const { lang, state } of langStates) {
        if (!state) continue
        if ((state.status === 'complete' || state.status === 'error') &&
            langStartRef.current[lang.code] && next[lang.code] == null) {
          next[lang.code] = Math.round(performance.now() - langStartRef.current[lang.code])
        }
      }
      return next
    })
  }, [langStates.map(l => l.state?.status).join('|')])

  function copyAsMarkdown() {
    const headers = ['#', 'Lang', 'Prompt', 'Condition', 'C', 'Location', 'L', 'Age', 'A', 'Sex', 'ms']
    const rows = TEST_PROMPTS.map((p, i) => {
      const r = results[p.id]
      const f = r?.fields ?? {}
      const cMark = r?.fields ? scoreCondition(f.condition, p.expectedCondition) : (r?.error ? 'err' : '–')
      const lMark = r?.fields ? scoreLocation(f.location, p.expectedLocation) : (r?.error ? 'err' : '–')
      const aMark = r?.fields ? scoreAge(f.age, p.expectedAge) : (r?.error ? 'err' : '–')
      return [
        i + 1,
        p.lang,
        p.text.replace(/\|/g, '\\|'),
        f.condition ?? '—',
        cMark,
        f.location ?? '—',
        lMark,
        f.age ?? '—',
        aMark,
        f.sex ?? '—',
        r?.ms ?? '—',
      ].join(' | ')
    })
    const lines = [
      `### NLP extraction test — model: ${model.label} (${model.id})`,
      '',
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows.map(r => `| ${r} |`),
    ]
    if (fixtureState?.status === 'complete' || fixtureState?.status === 'error') {
      lines.push('', '### Simplification test — fixture trial (English)', '')
      lines.push(`Latency: ${simplifyMs ?? '—'} ms · status: ${fixtureState.status}`)
      lines.push('', '**Plain-language summary:**', '', fixtureState.summary || '(empty)')
      if (fixtureState.eligibility) {
        lines.push('', '**Plain-language eligibility:**', '', fixtureState.eligibility)
      }
      if (fixtureState.error) {
        lines.push('', `Error: ${fixtureState.error}`)
      }
    }
    const anyLang = langStates.some(({ state }) => state?.status === 'complete' || state?.status === 'error')
    if (anyLang) {
      lines.push('', '### Multilingual simplification test', '')
      for (const { lang, state } of langStates) {
        if (!state) continue
        lines.push('', `#### ${lang.label} — ${langMs[lang.code] ?? '—'} ms · status: ${state.status}`)
        lines.push('', '**Summary:**', '', state.summary || '(empty)')
        if (state.eligibility) lines.push('', '**Eligibility:**', '', state.eligibility)
        if (state.error) lines.push('', `Error: ${state.error}`)
      }
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

  return (
    <div className="p-6 max-w-5xl mx-auto text-sm text-parchment-950">
      <h2 className="text-lg font-bold mb-2">NLP Multilingual Extraction Test</h2>
      <p className="mb-3 text-parchment-700">
        Model: <code>{model.label}</code> ({model.id}). Switch with <code>?model=gemma</code> or
        <code> ?model=qwen3</code>. Status: <code>{status}</code>
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
          disabled={status !== 'ready' || running}
          className="bg-parchment-700 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          {running ? `Running… (${currentId ?? ''})` : 'Run all 20 extraction prompts'}
        </button>
        <button
          type="button"
          onClick={runSimplify}
          disabled={status !== 'ready' || running}
          className="bg-parchment-700 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          {fixtureState?.status === 'streaming' ? 'Simplifying…' : 'Run simplification (English)'}
        </button>
        <button
          type="button"
          onClick={runMultilingualSimplify}
          disabled={status !== 'ready' || running}
          className="bg-parchment-700 text-white px-3 py-2 rounded-md disabled:opacity-50"
        >
          Run simplification × 4 languages
        </button>
        <button
          type="button"
          onClick={copyAsMarkdown}
          disabled={Object.keys(results).length === 0 && !fixtureState}
          className="border border-parchment-700 px-3 py-2 rounded-md disabled:opacity-50"
        >
          Copy results as markdown
        </button>
      </div>

      <h3 className="text-sm font-bold mb-2">Extraction (condition · location · age)</h3>
      <table className="w-full border-collapse text-xs mb-6">
        <thead>
          <tr className="bg-parchment-100 text-left">
            <th className="border border-parchment-300 px-2 py-1">#</th>
            <th className="border border-parchment-300 px-2 py-1">Lang</th>
            <th className="border border-parchment-300 px-2 py-1">Prompt</th>
            <th className="border border-parchment-300 px-2 py-1">Condition</th>
            <th className="border border-parchment-300 px-2 py-1">C</th>
            <th className="border border-parchment-300 px-2 py-1">Location</th>
            <th className="border border-parchment-300 px-2 py-1">L</th>
            <th className="border border-parchment-300 px-2 py-1">Age</th>
            <th className="border border-parchment-300 px-2 py-1">A</th>
            <th className="border border-parchment-300 px-2 py-1">Sex</th>
            <th className="border border-parchment-300 px-2 py-1">ms</th>
          </tr>
        </thead>
        <tbody>
          {TEST_PROMPTS.map((p, i) => {
            const r = results[p.id]
            const f = r?.fields ?? {}
            const isCurrent = currentId === p.id
            const cMark = r?.fields ? scoreCondition(f.condition, p.expectedCondition) : (r?.error ? 'err' : '–')
            const lMark = r?.fields ? scoreLocation(f.location, p.expectedLocation) : (r?.error ? 'err' : '–')
            const aMark = r?.fields ? scoreAge(f.age, p.expectedAge) : (r?.error ? 'err' : '–')
            return (
              <tr key={p.id} className={isCurrent ? 'bg-amber-100' : ''}>
                <td className="border border-parchment-300 px-2 py-1">{i + 1}</td>
                <td className="border border-parchment-300 px-2 py-1">{p.lang}</td>
                <td className="border border-parchment-300 px-2 py-1 max-w-xs">{p.text}</td>
                <td className="border border-parchment-300 px-2 py-1">{f.condition ?? (r?.error ? <span className="text-red-700">err</span> : '—')}</td>
                <td className="border border-parchment-300 px-2 py-1 text-center">{cMark}</td>
                <td className="border border-parchment-300 px-2 py-1">{f.location ?? '—'}</td>
                <td className="border border-parchment-300 px-2 py-1 text-center">{lMark}</td>
                <td className="border border-parchment-300 px-2 py-1">{f.age ?? '—'}</td>
                <td className="border border-parchment-300 px-2 py-1 text-center">{aMark}</td>
                <td className="border border-parchment-300 px-2 py-1">{f.sex ?? '—'}</td>
                <td className="border border-parchment-300 px-2 py-1 text-right">{r?.ms ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="text-sm font-bold mb-2">Simplification (fixture trial)</h3>
      <details className="mb-2 text-xs">
        <summary className="cursor-pointer text-parchment-700">Source trial fed to model</summary>
        <div className="bg-parchment-50 border border-parchment-300 rounded p-2 mt-1">
          <p className="font-semibold">{FIXTURE_TRIAL.title}</p>
          <p className="mt-1 whitespace-pre-wrap">{FIXTURE_TRIAL.summary}</p>
          <p className="mt-2 font-semibold">Eligibility:</p>
          <pre className="whitespace-pre-wrap">{FIXTURE_TRIAL.eligibility.criteria}</pre>
        </div>
      </details>

      {fixtureState && (
        <div className="border border-parchment-300 rounded p-3 bg-white">
          <p className="text-xs text-parchment-700 mb-2">
            Status: <code>{fixtureState.status}</code>
            {simplifyMs != null && ` · ${simplifyMs} ms`}
            {' · '}{fixtureState.buffer?.length ?? 0} chars
          </p>
          {fixtureState.summary && (
            <>
              <p className="font-semibold text-xs uppercase text-parchment-700 mt-2">Plain-language summary</p>
              <div className="whitespace-pre-wrap mt-1">{fixtureState.summary}</div>
            </>
          )}
          {fixtureState.eligibility && (
            <>
              <p className="font-semibold text-xs uppercase text-parchment-700 mt-3">Plain-language eligibility</p>
              <div className="whitespace-pre-wrap mt-1">{fixtureState.eligibility}</div>
            </>
          )}
          {fixtureState.buffer && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-parchment-700">Raw buffer ({fixtureState.buffer.length} chars)</summary>
              <pre className="whitespace-pre-wrap break-words bg-parchment-50 border border-parchment-300 p-2 mt-1 text-[11px] font-mono">
                {fixtureState.buffer || '(empty)'}
              </pre>
            </details>
          )}
          {fixtureState.error && (
            <p className="text-red-700 mt-2">Error: {fixtureState.error}</p>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold mt-6 mb-2">Multilingual simplification (same trial, 4 output languages)</h3>
      <p className="text-xs text-parchment-700 mb-2">
        Tests whether the model can produce the plain-language summary in the patient's input language.
        Tasks run sequentially through the shared worker queue, so total time = sum of all 4.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {langStates.map(({ lang, state }) => (
          <div key={lang.code} className="border border-parchment-300 rounded p-3 bg-white">
            <p className="text-xs text-parchment-700 mb-2 flex justify-between">
              <span><strong>{lang.label}</strong> · status: <code>{state?.status ?? 'idle'}</code> · {state?.buffer?.length ?? 0} chars</span>
              <span>{langMs[lang.code] != null ? `${langMs[lang.code]} ms` : ''}</span>
            </p>
            {state?.summary && (
              <>
                <p className="font-semibold text-xs uppercase text-parchment-700">Summary</p>
                <div className="whitespace-pre-wrap text-xs mt-1" dir={lang.code === 'ar' ? 'rtl' : 'ltr'}>
                  {state.summary}
                </div>
              </>
            )}
            {state?.eligibility && (
              <>
                <p className="font-semibold text-xs uppercase text-parchment-700 mt-2">Eligibility</p>
                <div className="whitespace-pre-wrap text-xs mt-1" dir={lang.code === 'ar' ? 'rtl' : 'ltr'}>
                  {state.eligibility}
                </div>
              </>
            )}
            {state?.buffer && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-parchment-700">Raw buffer ({state.buffer.length} chars)</summary>
                <pre className="whitespace-pre-wrap break-words bg-parchment-50 border border-parchment-300 p-2 mt-1 text-[11px] font-mono" dir={lang.code === 'ar' ? 'rtl' : 'ltr'}>
                  {state.buffer || '(empty)'}
                </pre>
              </details>
            )}
            {state?.error && <p className="text-red-700 text-xs mt-2">Error: {state.error}</p>}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-parchment-700">
        Extraction: ✓ exact / ~ partial / ✗ wrong-or-missing for condition; ✓ city-substring / ✗ for
        location; exact-integer match for age. Simplification: visually inspect for accuracy, reading
        level, and absence of invented details.
      </p>
    </div>
  )
}
