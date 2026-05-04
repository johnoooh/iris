import { useState } from 'react'

const PHASE_LABELS = {
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
}

const PHASE_DESCRIPTIONS = {
  PHASE1: 'Testing safety and dosage in a small group of people.',
  PHASE2: 'Testing whether the treatment works and studying side effects.',
  PHASE3: 'Comparing the treatment to existing standard treatments in a large group.',
  PHASE4: 'Monitoring long-term safety after the treatment is approved.',
}

export default function PhaseExplainer({ phases }) {
  const [tooltip, setTooltip] = useState(null)

  if (!phases || phases.length === 0) {
    return <span className="text-xs text-parchment-700">N/A</span>
  }

  const label = phases.map(p => PHASE_LABELS[p] ?? p).join(' / ')
  const description = phases.map(p => PHASE_DESCRIPTIONS[p]).filter(Boolean).join(' ')

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="text-xs text-parchment-800 underline decoration-dotted cursor-help"
        onMouseEnter={() => setTooltip(description)}
        onMouseLeave={() => setTooltip(null)}
        onFocus={() => setTooltip(description)}
        onBlur={() => setTooltip(null)}
        aria-describedby={tooltip ? 'phase-tooltip' : undefined}
      >
        {label}
      </button>
      {tooltip && (
        <span
          id="phase-tooltip"
          role="tooltip"
          className="absolute bottom-full left-0 mb-1 w-64 rounded bg-parchment-950 text-parchment-50 text-xs px-3 py-2 z-10 shadow-lg"
        >
          {tooltip}
        </span>
      )}
    </span>
  )
}
