import { nearestLocation } from '../utils/apiHelpers'

const PHASE_SHORT = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
  NA: 'N/A',
}

function formatPhase(phases) {
  if (!phases || phases.length === 0) return null
  return phases.map(p => PHASE_SHORT[p] ?? p).join(' / ')
}

export default function TriageRow({ trial, coords, selected, onSelect }) {
  const nearest = nearestLocation(trial.locations, coords)
  const phase = formatPhase(trial.phases)

  return (
    <button
      type="button"
      onClick={() => onSelect(trial.nctId)}
      aria-current={selected ? 'true' : undefined}
      className={[
        'text-left w-full px-4 py-[18px] flex flex-col gap-1.5 cursor-pointer transition-colors',
        'border-l-[3px]',
        selected
          ? 'bg-white border-iris-500 shadow-sm'
          : 'bg-transparent border-transparent hover:bg-parchment-50',
      ].join(' ')}
    >
      <span
        className="font-serif font-semibold text-[14.5px] text-parchment-950 leading-snug overflow-hidden"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {trial.title}
      </span>
      <span className="font-mono text-[11px] text-parchment-700 flex flex-wrap gap-x-1.5">
        {nearest?.distanceMi != null && <span>{nearest.distanceMi} mi</span>}
        {nearest?.distanceMi != null && phase && <span aria-hidden="true">·</span>}
        {phase && <span>{phase}</span>}
      </span>
    </button>
  )
}
