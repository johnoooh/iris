import { useEffect, useMemo, useState } from 'react'
import { useGeocode } from '../hooks/useGeocode'
import { useClinicalTrials } from '../hooks/useClinicalTrials'
import { useSimplifier } from '../hooks/useSimplifier'
import ResultCard from './ResultCard'
import TriageRow from './TriageRow'
import MobileSheet from './MobileSheet'
import {
  detectInputLanguage,
  outputLanguageFor,
  SUPPORTED_SIMPLIFICATION_LANGUAGES,
} from '../utils/detectInputLanguage'

const EAGER_BATCH_SIZE = 5
const MOBILE_BREAKPOINT_PX = 820
const LIST_WIDTH_PX = 400

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function ResultsList({ searchParams, modelKey, userDescription, extractedFields }) {
  // Phase 3 simplification only ships for English and Spanish — those are
  // the languages we've verified the local model produces accurately.
  // Other languages get a "use browser translate" hint instead.
  const inputLanguage = useMemo(() => detectInputLanguage(userDescription), [userDescription])
  const simplificationSupported = SUPPORTED_SIMPLIFICATION_LANGUAGES.has(inputLanguage)
  const outputLanguage = outputLanguageFor(inputLanguage)
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

  const isMobile = useIsMobile()
  const [selectedNctId, setSelectedNctId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Default selection to the first trial when results arrive (desktop only —
  // on mobile we wait for an explicit tap to open the sheet).
  useEffect(() => {
    if (allTrials.length === 0) {
      setSelectedNctId(null)
      return
    }
    if (!selectedNctId || !allTrials.some(t => t.nctId === selectedNctId)) {
      setSelectedNctId(allTrials[0].nctId)
    }
  }, [allTrials, selectedNctId])

  const selected = allTrials.find(t => t.nctId === selectedNctId) ?? null

  function onSelectTrial(nctId) {
    setSelectedNctId(nctId)
    if (isMobile) setSheetOpen(true)
  }

  // Fire when the result set changes — keyed on the first 5 NCT IDs.
  // Using searchParams as the key would fire too early (before data arrives);
  // using allTrials would re-fire on every pagination append.
  const eagerKey = allTrials.slice(0, EAGER_BATCH_SIZE).map(t => t.nctId).join(',')
  useEffect(() => {
    simplifier.cancelPending()
    simplifier.resetCache()
    if (allTrials.length === 0) return
    if (!simplificationSupported) return
    const eager = allTrials.slice(0, EAGER_BATCH_SIZE)
    for (const t of eager) simplifier.enqueueSummarize(t, { outputLanguage })
    if (extractedFields) {
      for (const t of eager) simplifier.enqueueAssessFit(t, { outputLanguage })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eagerKey, simplificationSupported, outputLanguage])

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
    if (!simplificationSupported) return
    simplifier.enqueueSummarize(trial, { outputLanguage })
    if (extractedFields) simplifier.enqueueAssessFit(trial, { outputLanguage })
  }

  function renderDetail(trial) {
    return (
      <ResultCard
        trial={trial}
        coords={coords ?? null}
        simplification={simplifier.states.get(trial.nctId)}
        onRequestSimplify={simplificationSupported ? handleRequestSimplify : null}
        inputLanguage={inputLanguage}
        simplificationSupported={simplificationSupported}
        pane
      />
    )
  }

  return (
    <section className="flex flex-col flex-1 min-h-0" aria-label="Search results">
      {showGeoFallback && (
        <p className="px-6 py-2 text-xs text-parchment-700 italic border-b border-parchment-200">
          Couldn&apos;t pinpoint that location — showing results without distance filtering.
        </p>
      )}

      <div className="px-6 py-3 border-b border-parchment-200 flex items-center gap-4">
        <p className="font-mono text-[11px] text-parchment-700">
          {totalCount.toLocaleString()} trial{totalCount !== 1 ? 's' : ''} found
        </p>
      </div>

      <div
        className="flex-1 grid min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: isMobile ? '1fr' : `${LIST_WIDTH_PX}px 1fr`,
        }}
      >
        <div className="overflow-auto bg-parchment-100 border-r border-parchment-200 flex flex-col">
          <ul className="flex flex-col">
            {allTrials.map(trial => (
              <li key={trial.nctId} className="border-b border-parchment-200">
                <TriageRow
                  trial={trial}
                  coords={coords ?? null}
                  selected={!isMobile && trial.nctId === selectedNctId}
                  onSelect={onSelectTrial}
                />
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="m-4 text-sm text-iris-700 hover:text-iris-900 underline disabled:opacity-50 self-start"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more results'}
            </button>
          )}
        </div>

        {!isMobile && (
          <div className="overflow-auto bg-white" aria-live="polite">
            {selected && renderDetail(selected)}
          </div>
        )}
      </div>

      {isMobile && (
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          label={selected ? `Trial details: ${selected.title}` : 'Trial details'}
        >
          {selected && renderDetail(selected)}
        </MobileSheet>
      )}
    </section>
  )
}
