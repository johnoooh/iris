import { useState, useEffect } from 'react'
import { useNLP } from '../hooks/useNLP'
import { useClassifier } from '../hooks/useClassifier'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'

const SAMPLE_TRIALS = [
  {
    nctId: 'NCT05952557',
    title: 'Phase IIIb Study of Ribociclib + Endocrine Therapy in Early Breast Cancer',
    eligibility: 'Inclusion: Adult female, ≥18 years. HR-positive, HER2-negative early breast cancer. Completed definitive surgery. Postmenopausal status confirmed. ECOG 0-1. Adequate organ function. Exclusion: Prior CDK4/6 inhibitor. Pregnancy or breastfeeding. Active second malignancy.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT06104020',
    title: 'Sacituzumab Govitecan in Metastatic Triple-Negative Breast Cancer',
    eligibility: 'Inclusion: Adult, any sex. Histologically confirmed metastatic triple-negative breast cancer (ER<1%, PR<1%, HER2-negative). At least one prior line of systemic therapy in metastatic setting. ECOG 0-2. Measurable disease per RECIST 1.1. Exclusion: Active CNS metastases. Prior topoisomerase I inhibitor.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05887492',
    title: 'Adaptive Radiation Boost in Locally Advanced HER2+ Breast Cancer',
    eligibility: 'Inclusion: Adult female. HER2-positive breast cancer confirmed by IHC 3+ or FISH-positive. Stage II-III disease. Completed neoadjuvant chemotherapy. ECOG 0-1. Exclusion: Prior radiation to chest. Pregnancy.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT06221340',
    title: 'Aerobic Exercise During Adjuvant Chemo for Breast Cancer Survivors',
    eligibility: 'Inclusion: Adult, any sex. Breast cancer, any stage. Currently receiving or scheduled for adjuvant chemotherapy. Cleared by oncologist for moderate exercise. Exclusion: Cardiac contraindications.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT04123456',
    title: 'Pembrolizumab in Advanced Non-Small Cell Lung Cancer',
    eligibility: 'Inclusion: Adult. Histologically confirmed advanced NSCLC. PD-L1 expression ≥50%. ECOG 0-1. Exclusion: Active autoimmune disease. Prior immunotherapy.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT05123987',
    title: 'Targeted Therapy in Pediatric Acute Lymphoblastic Leukemia',
    eligibility: 'Inclusion: Pediatric patients aged 2-17 years. Newly diagnosed ALL. Exclusion: Adults. Prior chemotherapy.',
    expected: 'UNLIKELY',
  },

  // ─── Subtype-gated breast cancer trials — POSSIBLE without confirmed subtype ───
  {
    nctId: 'NCT05300100',
    title: 'Tucatinib + Trastuzumab in HER2-Positive Metastatic Breast Cancer',
    eligibility: 'Inclusion: Adult, any sex, ≥18 years. Histologically confirmed HER2-positive metastatic breast cancer (IHC 3+ or FISH-amplified). At least 2 prior HER2-directed therapies. ECOG 0-1. Exclusion: Untreated brain metastases. Prior tucatinib.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05400201',
    title: 'Olaparib Maintenance in BRCA-Mutated HER2-Negative Breast Cancer',
    eligibility: 'Inclusion: Adult female. HER2-negative breast cancer with germline BRCA1 or BRCA2 mutation (confirmed by central testing). High-risk early disease following adjuvant chemotherapy. Postmenopausal or premenopausal with ovarian suppression. Exclusion: Prior PARP inhibitor.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05511223',
    title: 'CDK4/6 Inhibitor Switch in Hormone-Receptor-Positive Advanced Breast Cancer',
    eligibility: 'Inclusion: Adult women, postmenopausal. HR-positive, HER2-negative advanced or metastatic breast cancer. Disease progression on a prior CDK4/6 inhibitor. ECOG 0-2.',
    expected: 'POSSIBLE',
  },

  // ─── Strong matches for a 58yo with breast cancer ───
  {
    nctId: 'NCT05633445',
    title: 'Cognitive Behavioral Therapy for Cancer-Related Fatigue',
    eligibility: 'Inclusion: Adults ≥18 years with any solid tumor diagnosis (breast, colon, lung, prostate, etc.). Currently in active treatment or within 5 years of treatment completion. Self-reported fatigue ≥4 on a 0-10 scale. Exclusion: Severe untreated depression. Inability to attend weekly sessions.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05755677',
    title: 'Lymphedema Surveillance Program After Breast Cancer Surgery',
    eligibility: 'Inclusion: Adult female ≥18 years. History of breast cancer treated with axillary surgery (sentinel lymph node biopsy or axillary dissection). Within 3 years of surgery. Exclusion: Pre-existing lymphedema. Current breast cancer recurrence.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05822334',
    title: 'Mindfulness-Based Stress Reduction for Breast Cancer Survivors',
    eligibility: 'Inclusion: Adult women ≥21 years. Diagnosed with breast cancer (any stage). Completed primary treatment within the past 5 years OR currently on adjuvant endocrine therapy. Exclusion: Active psychosis. Prior MBSR participation.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05901128',
    title: 'Vaginal Estrogen Safety Study in Postmenopausal Breast Cancer Survivors',
    eligibility: 'Inclusion: Postmenopausal women ages 45-75 with a history of HR-positive or HR-negative breast cancer. Disease-free for ≥1 year. Genitourinary symptoms of menopause. Stable on aromatase inhibitor or tamoxifen, or treatment-free. Exclusion: Current metastatic disease.',
    expected: 'LIKELY',
  },

  // ─── Wrong condition / wrong demographic — clear UNLIKELY ───
  {
    nctId: 'NCT04567890',
    title: 'Pembrolizumab in Advanced Melanoma',
    eligibility: 'Inclusion: Adults with histologically confirmed unresectable Stage III or Stage IV melanoma. ECOG 0-1. No prior systemic therapy for advanced disease. Exclusion: Active autoimmune disease.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04678901',
    title: 'Apixaban vs. Warfarin in Atrial Fibrillation',
    eligibility: 'Inclusion: Adults ≥18 years with non-valvular atrial fibrillation. CHA2DS2-VASc score ≥2. Exclusion: Mechanical heart valve. Active bleeding.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04789012',
    title: 'GLP-1 Agonist for Weight Management in Type 2 Diabetes',
    eligibility: 'Inclusion: Adults 18-75 with Type 2 diabetes mellitus. BMI ≥30. HbA1c 7.0-10.0%. Exclusion: Type 1 diabetes. Active malignancy within 5 years. History of pancreatitis.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04890123',
    title: 'Robotic Prostatectomy Outcomes in Localized Prostate Cancer',
    eligibility: 'Inclusion: Men ≥40 years with biopsy-confirmed clinically localized prostate cancer (T1-T2). Candidate for radical prostatectomy. Exclusion: Prior pelvic surgery or radiation.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04901234',
    title: 'Pediatric Vaccine Immunogenicity Study',
    eligibility: 'Inclusion: Healthy children aged 6 months to 5 years. Up to date on routine immunizations. Exclusion: Immunocompromised. Recent illness within 14 days.',
    expected: 'UNLIKELY',
  },

  // ─── Edge cases — should challenge the model ───
  {
    nctId: 'NCT05012345',
    title: 'Palliative Care Integration in Patients with Advanced Solid Tumors',
    eligibility: 'Inclusion: Adults ≥18 years with advanced (Stage IV) solid tumor of any primary site (breast, lung, GI, GU, GYN). Estimated prognosis 6-24 months. ECOG 0-3. Exclusion: Currently enrolled in hospice.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05123450',
    title: 'Premenopausal Breast Cancer: Ovarian Function Suppression Trial',
    eligibility: 'Inclusion: Premenopausal women ages 18-45 with newly diagnosed HR-positive early breast cancer. Confirmed premenopausal by FSH and estradiol levels. Exclusion: Postmenopausal status. Prior ovarian suppression therapy.',
    expected: 'UNLIKELY',
  },
]

const DEFAULT_PROMPT = `You are evaluating clinical trial fit.

User: {{user}}
Trial title: {{title}}
Eligibility (excerpt): {{eligibility}}

Reply on one line, exactly: VERDICT | one-sentence reason
where VERDICT is LIKELY, POSSIBLE, or UNLIKELY.`

const DEFAULT_USER_DESC = "I'm 58 years old with breast cancer in Boston"

function parseVerdict(raw) {
  if (!raw || typeof raw !== 'string') return { verdict: 'PARSE_FAIL', reason: '(empty output)' }
  const m = raw.match(/^\s*(LIKELY|POSSIBLE|UNLIKELY)\s*[|:\-—]\s*(.+?)\s*$/im)
  if (m) return { verdict: m[1].toUpperCase(), reason: m[2].trim() }
  const w = raw.match(/\b(LIKELY|POSSIBLE|UNLIKELY)\b/i)
  if (w) {
    return {
      verdict: w[1].toUpperCase(),
      reason: raw.replace(w[0], '').replace(/^[\s|:\-—]+/, '').trim() || '(no reason)',
    }
  }
  return { verdict: 'PARSE_FAIL', reason: raw.slice(0, 120) }
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
  const { classifyOne } = useClassifier()

  const [userDesc, setUserDesc] = useState(DEFAULT_USER_DESC)
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT)
  const [trialsJson, setTrialsJson] = useState(JSON.stringify(SAMPLE_TRIALS, null, 2))
  const [concurrency, setConcurrency] = useState(3)
  const [eligMax, setEligMax] = useState(1500)
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

    const queue = trials.map((trial, idx) => ({ idx, trial }))
    const workersN = Math.min(concurrency, trials.length)

    async function worker() {
      while (queue.length) {
        const { idx, trial } = queue.shift()
        const elig = (trial.eligibility || '').slice(0, eligMax)
        const prompt = promptTemplate
          .replace('{{user}}', userDesc)
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

  // ───────── stats ─────────
  const done = results.filter(r => r.status === 'DONE')
  const lats = done.map(r => r.latencyMs).filter(n => n != null)
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0
  const maxLat = lats.length ? Math.round(Math.max(...lats)) : 0
  const parseFails = done.filter(r => r.verdict === 'PARSE_FAIL').length
  const parseRate = done.length ? Math.round(((done.length - parseFails) / done.length) * 100) : 0
  const elapsed = startT ? ((performance.now() - startT) / 1000).toFixed(1) : '0.0'
  const withExpected = done.filter(r => r.trial.expected)
  const matches = withExpected.filter(r => r.verdict === r.trial.expected).length
  const agreementPct = withExpected.length ? Math.round((matches / withExpected.length) * 100) : null

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
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
              User description
            </label>
            <textarea
              rows={3}
              value={userDesc}
              onChange={e => setUserDesc(e.target.value)}
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

        {(running || done.length > 0) && (
          <div className="flex flex-wrap gap-4 font-mono text-[11px] text-parchment-700 mt-3">
            <span><strong className="text-parchment-950">{done.length} / {results.length}</strong> done</span>
            <span>elapsed <strong className="text-parchment-950">{elapsed}s</strong></span>
            <span>avg latency <strong className="text-parchment-950">{avgLat}ms</strong></span>
            <span>max latency <strong className="text-parchment-950">{maxLat}ms</strong></span>
            <span>parse rate <strong className="text-parchment-950">{parseRate}%</strong></span>
            <span>parse fails <strong className="text-parchment-950">{parseFails}</strong></span>
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
            {matches} / {withExpected.length} ({agreementPct}%) — useful as a smoke test on a labeled
            held-out set. Below ~80% means the prompt or model needs work before this drives sort order.
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
          const expected = r.trial.expected || '—'
          const match = r.verdict && r.trial.expected
            ? (r.verdict === r.trial.expected ? '✓' : '✗')
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
