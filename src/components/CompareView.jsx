// Skeletal compare view — just lists pinned trials by title with a back
// button. The full side-by-side field grid lands in the next commit; this
// is enough to wire the route + Compare → button so the navigation flow
// can be exercised before the layout work.

export default function CompareView({ compareSet, pinnedTrials, onBack, onRemove }) {
  // Resolve the Set of NCT IDs against the pinned-trials cache. The cache
  // was populated when the user pinned each trial, so it has data even if
  // the current search no longer returns those trials.
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

      <main className="flex-1 px-4 sm:px-7 py-6 max-w-[1200px] w-full mx-auto">
        {trials.length === 0 ? (
          <p className="text-[14px] text-parchment-700 italic">
            No trials pinned yet. Use the checkbox on each trial to add up to 3.
          </p>
        ) : (
          <ul className="space-y-3">
            {trials.map(trial => (
              <li
                key={trial.nctId}
                className="bg-white border border-parchment-200 rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <h2 className="font-serif font-semibold text-[15px] text-parchment-950 leading-snug">
                    {trial.title}
                  </h2>
                  <p className="font-mono text-[11px] text-parchment-500 mt-1">
                    {trial.nctId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(trial.nctId)}
                  className="text-[12px] text-parchment-700 hover:text-parchment-950 shrink-0"
                  aria-label={`Remove ${trial.title} from compare`}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="font-mono text-[11px] text-parchment-500 italic mt-8">
          Side-by-side field grid + print export coming in the next commits.
        </p>
      </main>
    </div>
  )
}
