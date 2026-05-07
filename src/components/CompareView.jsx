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

export default function CompareView({ compareSet, pinnedTrials, onBack, onRemove }) {
  const trials = []
  for (const nctId of compareSet) {
    const trial = pinnedTrials.get(nctId)
    if (trial) trials.push(trial)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <header className="border-b border-parchment-200 px-4 sm:px-7 py-4 flex items-center justify-between gap-3">
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
        <span className="font-mono text-[11px] text-parchment-700">
          {trials.length} pinned
        </span>
      </header>

      <main className="flex-1 px-4 sm:px-7 py-6 max-w-[1400px] w-full mx-auto">
        {trials.length === 0 ? (
          <p className="text-[14px] text-parchment-700 italic">
            No trials pinned yet. Use the checkbox on each trial to add up to 3.
          </p>
        ) : (
          <CompareTable trials={trials} onRemove={onRemove} />
        )}
      </main>
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
