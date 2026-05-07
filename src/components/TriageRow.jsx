import { nearestLocation } from '../utils/apiHelpers'

function FitDot({ classification, pending }) {
  if (classification?.verdict === 'PARSE_FAIL') return null

  if (pending && !classification) {
    return (
      <span
        className="iris-shimmer-text inline-block w-2 h-2 rounded-full mr-1"
        title="Evaluating fit…"
        aria-label="Evaluating fit"
      >&nbsp;</span>
    )
  }
  if (!classification) return null

  const isLikely = classification.verdict === 'LIKELY'
  return (
    <span
      className={[
        'inline-block w-2 h-2 rounded-full mr-1 shrink-0',
        isLikely ? 'bg-iris-500' : 'border border-parchment-400',
      ].join(' ')}
      title={
        isLikely
          ? `Likely fit — ${classification.reason || 'matches your description'}`
          : `Less likely fit — ${classification.reason || 'may not match'}`
      }
      aria-label={isLikely ? 'Likely fit' : 'Less likely fit'}
    />
  )
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
  if (!phases || phases.length === 0) return null
  return phases.map(p => PHASE_SHORT[p] ?? p).join(' / ')
}

export default function TriageRow({
  trial,
  coords,
  selected,
  onSelect,
  comparing = false,
  onToggleCompare,
  compareDisabled = false,
  classification = null,
  classifyPending = false,
}) {
  const nearest = nearestLocation(trial.locations, coords)
  const phase = formatPhase(trial.phases)

  return (
    <div
      className={[
        'relative flex items-start gap-2 transition-colors border-l-[3px]',
        selected
          ? 'bg-white border-iris-500 shadow-sm'
          : 'bg-transparent border-transparent hover:bg-parchment-50',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(trial.nctId)}
        aria-current={selected ? 'true' : undefined}
        className="flex-1 text-left px-4 py-[18px] flex flex-col gap-1.5 cursor-pointer min-w-0"
      >
        <h3
          className="font-serif font-semibold text-[14.5px] text-parchment-950 leading-snug overflow-hidden m-0"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {trial.title}
        </h3>
        <span className="font-mono text-[11px] text-parchment-700 flex flex-wrap items-center gap-x-1.5">
          <FitDot classification={classification} pending={classifyPending} />
          {nearest?.distanceMi != null && <span>{nearest.distanceMi} mi</span>}
          {nearest?.distanceMi != null && phase && <span aria-hidden="true">·</span>}
          {phase && <span>{phase}</span>}
        </span>
      </button>
      {onToggleCompare && (
        <label
          className="shrink-0 pr-3 pt-[18px] cursor-pointer inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
          title={
            comparing
              ? 'Remove from compare'
              : compareDisabled
                ? 'Compare list is full (max 3)'
                : 'Add to compare'
          }
        >
          <input
            type="checkbox"
            checked={comparing}
            disabled={!comparing && compareDisabled}
            onChange={() => onToggleCompare(trial.nctId)}
            aria-label={comparing ? `Remove ${trial.title} from compare` : `Add ${trial.title} to compare`}
            className="w-[18px] h-[18px] accent-iris-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
      )}
    </div>
  )
}
