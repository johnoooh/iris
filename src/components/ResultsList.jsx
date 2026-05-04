import { useEffect } from 'react'
import { useGeocode } from '../hooks/useGeocode'
import { useClinicalTrials } from '../hooks/useClinicalTrials'
import { useSimplifier } from '../hooks/useSimplifier'
import ResultCard from './ResultCard'

const EAGER_BATCH_SIZE = 5

export default function ResultsList({ searchParams, modelKey, userDescription, extractedFields }) {
  const {
    data: coords,
    isError: geoFailed,
    isLoading: geoLoading,
  } = useGeocode(searchParams.location)

  const showGeoFallback = searchParams.location && geoFailed
  const geocodeSettled = !searchParams.location || !geoLoading

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useClinicalTrials(searchParams, coords ?? null, !geocodeSettled)

  const simplifier = useSimplifier({
    modelKey,
    userDescription,
    extractedFields,
  })

  const allTrials = data?.pages.flatMap(p => p.trials) ?? []

  // Eager batch on every search change. resetCache + cancelPending wipe stale
  // simplifications from the previous query.
  useEffect(() => {
    simplifier.cancelPending()
    simplifier.resetCache()
    if (allTrials.length === 0) return
    const eager = allTrials.slice(0, EAGER_BATCH_SIZE)
    for (const t of eager) simplifier.enqueueSummarize(t)
    if (extractedFields) {
      for (const t of eager) simplifier.enqueueAssessFit(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (isLoading) {
    return (
      <div className="px-6 py-8 text-sm text-parchment-800" aria-live="polite">
        {showGeoFallback && (
          <p className="text-xs text-parchment-700 mb-3 italic">
            Couldn&apos;t pinpoint that location — showing results without distance filtering.
          </p>
        )}
        Searching ClinicalTrials.gov…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-6 py-8 max-w-xl" role="alert">
        <p className="text-sm text-parchment-900 font-medium mb-1">
          We couldn&apos;t reach ClinicalTrials.gov right now.
        </p>
        <p className="text-sm text-parchment-800">
          This might be a temporary issue — please try again in a few minutes.
        </p>
      </div>
    )
  }

  const totalCount = data?.pages[0]?.totalCount ?? 0

  if (allTrials.length === 0) {
    return (
      <div className="px-6 py-8 max-w-xl" aria-live="polite">
        <p className="text-sm font-medium text-parchment-950 mb-2">No trials found.</p>
        <p className="text-sm text-parchment-800 mb-1">Try:</p>
        <ul className="text-sm text-parchment-800 list-disc list-inside space-y-1">
          {searchParams.location && <li>Removing the location filter</li>}
          <li>Broadening to all phases</li>
          <li>Using different condition phrasing (e.g. &quot;TNBC&quot; vs &quot;triple negative breast cancer&quot;)</li>
          <li>Setting recruitment status to &quot;All&quot;</li>
        </ul>
      </div>
    )
  }

  function handleRequestSimplify(trial) {
    simplifier.enqueueSummarize(trial)
    if (extractedFields) simplifier.enqueueAssessFit(trial)
  }

  return (
    <section className="px-6 py-6" aria-live="polite" aria-label="Search results">
      {showGeoFallback && (
        <p className="text-xs text-parchment-700 mb-3 italic">
          Couldn&apos;t pinpoint that location — showing results without distance filtering.
        </p>
      )}

      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm text-parchment-800">
          {totalCount.toLocaleString()} trial{totalCount !== 1 ? 's' : ''} found
        </p>
      </div>

      {allTrials.map(trial => (
        <ResultCard
          key={trial.nctId}
          trial={trial}
          coords={coords ?? null}
          simplification={simplifier.states.get(trial.nctId)}
          onRequestSimplify={handleRequestSimplify}
        />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 text-sm text-parchment-800 underline hover:text-parchment-950 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more results'}
        </button>
      )}
    </section>
  )
}
