// Side-by-side compare view for up to 3 pinned trials.
//
// Desktop (≥900px): table layout with field labels in the left column and
// one column per trial. Familiar tabular comparison.
//
// Mobile (<900px): stacked cards, one per trial, each with the same field
// rows. The table's responsive collapse uses `display: block` on td/tr —
// preserves semantics for screen readers but lets each "row" of one trial
// flow as its own block. (Decided against trying 2-col at tablet — at
// 768px each trial column is ~240px which crushes the eligibility text.)

import { nearestLocation } from '../utils/apiHelpers'

const STATUS_LABEL = {
  RECRUITING: 'Recruiting',
  NOT_YET_RECRUITING: 'Not yet recruiting',
  ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
  COMPLETED: 'Completed',
  TERMINATED: 'Terminated',
  WITHDRAWN: 'Withdrawn',
}

const PHASE_SHORT = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
  NA: 'N/A',
}

function formatPhase(phases) {
  if (!phases?.length) return '—'
  return phases.map(p => PHASE_SHORT[p] ?? p).join(' / ')
}

function locationLabel(trial) {
  const nearest = nearestLocation(trial.locations, null)
  if (!nearest) {
    if (trial.locations?.length) {
      const l = trial.locations[0]
      return [l.facility, l.city, l.state].filter(Boolean).join(', ')
    }
    return '—'
  }
  return [nearest.facility, nearest.city, nearest.state].filter(Boolean).join(', ')
}

function ageRange(eligibility) {
  const min = eligibility?.minAge
  const max = eligibility?.maxAge
  if (!min && !max) return '—'
  return `${min || 'N/A'} – ${max || 'N/A'}`
}

function sexLabel(sex) {
  if (!sex || sex === 'ALL') return 'Any'
  return sex.charAt(0) + sex.slice(1).toLowerCase()
}

const FIELDS = [
  { key: 'status',         label: 'Status',                render: (t) => STATUS_LABEL[t.status] || t.status || '—' },
  { key: 'phase',          label: 'Phase',                 render: (t) => formatPhase(t.phases) },
  { key: 'intervention',   label: 'Intervention',          render: (t) => t.interventions?.map(i => i.name).filter(Boolean).join(', ') || '—' },
  { key: 'location',       label: 'Nearest location',      render: locationLabel },
  { key: 'sex',            label: 'Sex',                   render: (t) => sexLabel(t.eligibility?.sex) },
  { key: 'age',            label: 'Age range',             render: (t) => ageRange(t.eligibility) },
  { key: 'eligibility',    label: 'Eligibility criteria',  render: (t) => t.eligibility?.criteria || '—', long: true },
  { key: 'summary',        label: 'Brief summary',         render: (t) => t.summary || '—', long: true },
  { key: 'contact',        label: 'Contact',               render: (t) => contactBlock(t) },
  { key: 'link',           label: 'ClinicalTrials.gov',    render: (t) => (
    <a href={t.ctGovUrl} target="_blank" rel="noreferrer" className="text-iris-700 hover:text-iris-900 break-all">
      {t.nctId}
    </a>
  )},
]

function contactBlock(trial) {
  const c = trial.contact || {}
  const parts = []
  if (c.name) parts.push(c.name)
  if (c.phone) parts.push(c.phone)
  if (c.email) parts.push(<a key="email" href={`mailto:${c.email}`} className="text-iris-700 hover:text-iris-900 break-all">{c.email}</a>)
  if (parts.length === 0) return '—'
  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((p, i) => <span key={i}>{p}</span>)}
    </div>
  )
}

function printAll() {
  document.body.setAttribute('data-print-scope', 'compare')
  const cleanup = () => {
    document.body.removeAttribute('data-print-scope')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

export default function CompareView({ compareSet, pinnedTrials, onBack, onRemove }) {
  const trials = []
  for (const nctId of compareSet) {
    const trial = pinnedTrials.get(nctId)
    if (trial) trials.push(trial)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <header className="no-print border-b border-parchment-200 px-4 sm:px-7 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[12px] text-iris-700 hover:text-iris-900"
        >
          ← back to results
        </button>
        <h1 className="font-serif font-semibold text-[20px] text-parchment-950">
          compare trials
        </h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-parchment-700">
            {trials.length} pinned
          </span>
          {trials.length > 0 && (
            <button
              type="button"
              onClick={printAll}
              className="bg-iris-600 text-white px-3 py-1 rounded-md text-[12px] font-semibold hover:bg-iris-700"
              title="Print all pinned trials — one per page, save as PDF for your doctor"
            >
              Print all ({trials.length})
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-7 py-6 max-w-[1400px] w-full mx-auto">
        {trials.length === 0 ? (
          <p className="text-[14px] text-parchment-700 italic">
            No trials pinned yet. Use the checkbox on each trial to add up to 3.
          </p>
        ) : (
          <>
            {/* Screen view: table on desktop, stacked cards on mobile */}
            <div className="no-print-only">
              <CompareTable trials={trials} onRemove={onRemove} />
            </div>
            {/* Print view: a one-line index page + one full trial per page */}
            <PrintCompare trials={trials} />
          </>
        )}
      </main>
    </div>
  )
}

// Print-only structure — hidden on screen via .print-only, takes over on
// print. The table layout doesn't paginate cleanly (10 fields × 3 columns
// crushes per-page), so we lay out one trial per page in a vertical stack
// using the same .iris-print-trial wrappers that print.css adds page breaks
// between.
function PrintCompare({ trials }) {
  const dateStr = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date())
  return (
    <div className="print-only">
      {/* Index page: one line per trial, before the per-trial pages start. */}
      <section className="iris-print-trial" style={{ marginBottom: '1.5em' }}>
        <h1 style={{ fontFamily: 'Source Serif 4, serif', fontSize: '20pt', marginBottom: '0.4em' }}>
          Clinical trial summary — {trials.length} trial{trials.length === 1 ? '' : 's'}
        </h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10pt', color: '#6b5d49', marginBottom: '1em' }}>
          Generated {dateStr} · IRIS · clinicaltrials.gov
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', marginTop: '0.5em' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ccc' }}>NCT</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ccc' }}>Title</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ccc' }}>Phase</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ccc' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {trials.map(t => (
              <tr key={t.nctId}>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', fontFamily: 'JetBrains Mono, monospace' }}>{t.nctId}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{t.title}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{formatPhase(t.phases)}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{STATUS_LABEL[t.status] || t.status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '10pt', color: '#6b5d49', marginTop: '1em', fontStyle: 'italic' }}>
          The trials below were pinned by a patient using IRIS, an open-source clinical-trial discovery
          tool. Eligibility and contact data come directly from ClinicalTrials.gov. Discuss with your
          care team whether any of these may be appropriate.
        </p>
      </section>

      {/* Per-trial pages — page break between via print.css */}
      {trials.map(t => (
        <section key={t.nctId} className="iris-print-trial" style={{ marginBottom: '1.5em' }}>
          <h2 style={{ fontFamily: 'Source Serif 4, serif', fontSize: '16pt', marginBottom: '0.3em' }}>
            {t.title}
          </h2>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10pt', color: '#6b5d49', marginBottom: '1em' }}>
            {t.nctId} · {STATUS_LABEL[t.status] || t.status || ''} · {formatPhase(t.phases)}
          </p>
          <dl style={{ fontSize: '11pt', lineHeight: 1.5 }}>
            {FIELDS.map(field => (
              <div key={field.key} style={{ marginBottom: '0.6em' }}>
                <dt style={{ fontWeight: 600, fontSize: '10pt', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#4f4434' }}>
                  {field.label}
                </dt>
                <dd style={{ marginLeft: 0, marginTop: '0.15em', whiteSpace: field.long ? 'pre-wrap' : 'normal' }}>
                  {field.render(t)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function CompareTable({ trials, onRemove }) {
  return (
    <>
      {/* Desktop: real table, side-by-side */}
      <table className="hidden lg:table w-full border-collapse">
        <colgroup>
          <col className="w-[180px]" />
          {trials.map(t => <col key={t.nctId} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="text-left p-3 align-bottom" />
            {trials.map(t => (
              <th key={t.nctId} className="text-left align-bottom p-3 border-b border-parchment-300">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="font-serif font-semibold text-[15px] text-parchment-950 leading-snug">
                    {t.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onRemove(t.nctId)}
                    className="font-mono text-[10px] text-parchment-500 hover:text-parchment-950 shrink-0"
                    aria-label={`Remove ${t.title} from compare`}
                  >
                    remove
                  </button>
                </div>
                <p className="font-mono text-[10px] text-parchment-500">{t.nctId}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(field => (
            <tr key={field.key} className="border-b border-parchment-200">
              <th
                scope="row"
                className="text-left align-top p-3 font-mono text-[10px] uppercase tracking-[0.08em] text-parchment-700"
              >
                {field.label}
              </th>
              {trials.map(t => (
                <td
                  key={t.nctId}
                  className={[
                    'align-top p-3 text-[13px] text-parchment-900 leading-relaxed',
                    field.long ? 'whitespace-pre-wrap' : '',
                  ].join(' ')}
                >
                  {field.render(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile / tablet portrait: stacked cards, one per trial */}
      <div className="lg:hidden space-y-6">
        {trials.map(t => (
          <article key={t.nctId} className="bg-white border border-parchment-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-parchment-200">
              <div className="min-w-0">
                <h2 className="font-serif font-semibold text-[15px] text-parchment-950 leading-snug">
                  {t.title}
                </h2>
                <p className="font-mono text-[10px] text-parchment-500 mt-1">{t.nctId}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(t.nctId)}
                className="font-mono text-[11px] text-parchment-700 hover:text-parchment-950 shrink-0"
                aria-label={`Remove ${t.title} from compare`}
              >
                remove
              </button>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-2.5 text-[13px] text-parchment-900">
              {FIELDS.map(field => (
                <div key={field.key} className="contents">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-parchment-700 sm:pt-0.5">
                    {field.label}
                  </dt>
                  <dd className={field.long ? 'whitespace-pre-wrap leading-relaxed' : 'leading-relaxed'}>
                    {field.render(t)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  )
}
