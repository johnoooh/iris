import { useEffect, useMemo, useRef, useState } from 'react'
import { useGeocode } from '../hooks/useGeocode'
import { useClinicalTrials } from '../hooks/useClinicalTrials'
import { useSimplifier } from '../hooks/useSimplifier'
import { useNLP } from '../hooks/useNLP'
import { useClassifier } from '../hooks/useClassifier'
import { NLP_MODELS } from '../utils/nlpModels'
import { buildClassifyPrompt, parseVerdict } from '../utils/classifyTrial'
import ResultCard from './ResultCard'
import TriageRow from './TriageRow'
import MobileSheet from './MobileSheet'
import {
  detectInputLanguage,
  outputLanguageFor,
  SUPPORTED_SIMPLIFICATION_LANGUAGES,
} from '../utils/detectInputLanguage'

const NLP_CONSENT_KEY = 'iris_nlp_enabled'

// Build a synthetic patient description from extracted fields when the user
// came in via structured form but had previously used NL (so consent exists).
function patientDescFromFields(fields) {
  if (!fields) return null
  const parts = []
  if (fields.age != null) parts.push(`${fields.age}-year-old`)
  if (fields.sex && fields.sex !== 'ALL') parts.push(fields.sex.toLowerCase())
  if (fields.condition) parts.push(`with ${fields.condition}`)
  if (fields.location) parts.push(`in ${fields.location}`)
  return parts.length > 0 ? parts.join(' ') : null
}

const EAGER_BATCH_SIZE = 5
const MOBILE_BREAKPOINT_PX = 820
const LIST_WIDTH_PX = 400

// matchMedia (not 'resize'): iOS Safari fires 'resize' inconsistently on
// rotation; matchMedia.change is the reliable signal. Also catches iPad
// split-screen and browser-window mode switches without a manual resize.
function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [compareSet, setCompareSet] = useState(() => new Set())

  // ─── Stage-1 classification ───────────────────────────────────────
  // Only fires when the user previously consented to the on-device model
  // (iris_nlp_enabled localStorage key, set during NL flow). Structured-
  // form-only sessions skip classification entirely — no auto-load,
  // no covert worker initialization. Verdicts surface as fit dots in
  // TriageRow + a "evaluating fit · X of N" caption in the toolbar.
  const nlp = useNLP()
  const { classifyOne } = useClassifier()
  const [classifications, setClassifications] = useState(new Map())
  const [classifyProgress, setClassifyProgress] = useState({ done: 0, total: 0 })
  const classifiedRef = useRef(new Set())
  const cancelClassifyRef = useRef(null)

  const consented = useMemo(() => {
    try { return localStorage.getItem(NLP_CONSENT_KEY) === 'true' } catch { return false }
  }, [])
  const patientDesc = userDescription || patientDescFromFields(extractedFields)
  const canClassify = consented && nlp.webGPUSupported && Boolean(patientDesc)

  // Idempotent: worker fast-returns 'ready' if engine already loaded
  // (e.g. NL extraction loaded it earlier this session). Destructure
  // load() out of nlp so we can list it in deps directly — `nlp` itself
  // is a fresh object on every render (useNLP doesn't memoize its
  // return), and listing the whole hook would re-fire the effect on
  // every render even when nothing relevant changed.
  const nlpLoad = nlp.load
  useEffect(() => {
    if (!canClassify) return
    if (nlp.status !== 'idle') return
    const model = NLP_MODELS[modelKey] ?? NLP_MODELS.gemma
    nlpLoad(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })
  }, [canClassify, nlp.status, modelKey, nlpLoad])

  // Reset classification state when EITHER the search params OR the patient
  // description changes. Including patientDesc handles the case where a user
  // hits "Find trials" again with a refined prompt that happens to extract
  // to the same condition: the API result set may be cached (same trials)
  // but the verdicts are now stale w.r.t. the new patient description, so
  // classifications + classifiedRef must be wiped and the in-flight batch
  // cancelled so the next pass re-classifies against the new patient.
  // Also resets the simplifier so any in-flight summary stops competing
  // with the re-classification pass.
  useEffect(() => {
    classifiedRef.current = new Set()
    setClassifications(new Map())
    setClassifyProgress({ done: 0, total: 0 })
    if (cancelClassifyRef.current) cancelClassifyRef.current()
    simplifier.cancelPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, patientDesc])

  function toggleCompare(nctId) {
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(nctId)) next.delete(nctId)
      else if (next.size < 3) next.add(nctId)
      return next
    })
  }

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

  // Classify newly-arrived trials. Pagination appends → classify only new
  // NCTs. Engine-not-loaded check is via nlp.status !== 'ready'.
  const trialKeyAll = allTrials.map(t => t.nctId).join(',')
  useEffect(() => {
    if (!canClassify || nlp.status !== 'ready' || !patientDesc) return
    const newTrials = allTrials.filter(t => !classifiedRef.current.has(t.nctId))
    if (newTrials.length === 0) return
    for (const t of newTrials) classifiedRef.current.add(t.nctId)

    setClassifyProgress(prev => ({ done: prev.done, total: prev.total + newTrials.length }))

    let cancelled = false
    cancelClassifyRef.current = () => { cancelled = true }
    ;(async () => {
      for (const trial of newTrials) {
        if (cancelled) return
        try {
          const prompt = buildClassifyPrompt(patientDesc, trial)
          const { raw } = await classifyOne(prompt)
          const parsed = parseVerdict(raw)
          if (cancelled) return
          setClassifications(prev => {
            const next = new Map(prev)
            next.set(trial.nctId, { status: 'done', ...parsed, raw })
            return next
          })
        } catch (err) {
          if (cancelled) return
          setClassifications(prev => {
            const next = new Map(prev)
            next.set(trial.nctId, { status: 'done', verdict: 'PARSE_FAIL', reason: err?.message ?? 'classify error' })
            return next
          })
        } finally {
          if (!cancelled) {
            setClassifyProgress(prev => ({ ...prev, done: prev.done + 1 }))
          }
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canClassify, nlp.status, patientDesc, trialKeyAll])

  // Reset the simplifier when the result set changes (new search). The
  // per-trial enqueue happens below in the selected-trial effect.
  const eagerKey = allTrials.slice(0, EAGER_BATCH_SIZE).map(t => t.nctId).join(',')
  useEffect(() => {
    simplifier.cancelPending()
    simplifier.resetCache()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eagerKey])

  // Per Handoff Phase 3 step 6: stage-2 simplification only fires for the
  // currently-selected trial. Critically, it WAITS for stage-1
  // classification to finish first — otherwise both compete for the
  // single-threaded worker, the classifier appears to stall, and the
  // simplifier (running first) produces noisier output under contention.
  // For structured-form-only sessions canClassify is false and
  // classifyProgress.total stays 0, so the gate falls through to "true"
  // and simplification runs immediately on selection.
  const classifyDone = !canClassify || (
    classifyProgress.total > 0 && classifyProgress.done >= classifyProgress.total
  )
  useEffect(() => {
    if (!simplificationSupported) return
    if (!selected) return
    if (!classifyDone) return
    simplifier.enqueueSummarize(selected, { outputLanguage })
    // assess_fit ("Why this might or might not fit you") intentionally not
    // enqueued — Gemma 2B's accuracy on the fit narrative isn't reliable
    // enough to ship (it occasionally flips disease stage / treatment
    // history). The classifier's binary verdict + dot is the safer signal.
    // The assess_fit pipeline itself stays in useSimplifier in case we
    // re-enable it on a fine-tuned model later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.nctId, simplificationSupported, outputLanguage, classifyDone])

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
    // assess_fit deliberately omitted — see selected-trial effect above.
  }

  function renderDetail(trial) {
    // Tell ResultCard which pipeline stage is in flight so it can render
    // an explicit progress caption above the empty content area instead of
    // showing the trial's raw summary (which can look like the model
    // already replied with the wrong text).
    let pipelineStage = null
    const sim = simplifier.states.get(trial.nctId)
    const simStatus = sim?.summarize?.status
    if (canClassify && !classifyDone) {
      pipelineStage = 'classifying'
    } else if (
      simplificationSupported &&
      (!simStatus || simStatus === 'queued') &&
      classifyDone
    ) {
      pipelineStage = 'awaiting-summary'
    }
    return (
      <ResultCard
        trial={trial}
        coords={coords ?? null}
        simplification={sim}
        onRequestSimplify={simplificationSupported ? handleRequestSimplify : null}
        inputLanguage={inputLanguage}
        simplificationSupported={simplificationSupported}
        pane
        pipelineStage={pipelineStage}
        classifyProgress={canClassify ? classifyProgress : null}
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

      <ResultsToolbar
        totalCount={totalCount}
        searchParams={searchParams}
        classifyProgress={canClassify ? classifyProgress : null}
      />

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
                  comparing={compareSet.has(trial.nctId)}
                  onToggleCompare={toggleCompare}
                  compareDisabled={compareSet.size >= 3}
                  classification={canClassify ? classifications.get(trial.nctId) : null}
                  classifyPending={canClassify && !classifications.has(trial.nctId)}
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

      {compareSet.size > 0 && (
        <CompareBar
          count={compareSet.size}
          onClear={() => setCompareSet(new Set())}
        />
      )}

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

const STATUS_LABELS = {
  RECRUITING: 'recruiting',
  NOT_YET_RECRUITING: 'not yet recruiting',
  ACTIVE_NOT_RECRUITING: 'active, not recruiting',
  COMPLETED: 'completed',
  ALL: null,
}

const PHASE_LABELS = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
}

// Sort UI removed — the chips were visible-but-disabled placeholders for
// "Best fit" / "Distance" / "Phase" / "Most recent" which read as broken
// to users. When sort wiring lands (CT.gov API supports `sort=` for
// distance and last-update; "Best fit" needs the classifier verdicts
// per-trial), restore from git history at 67d5fc8 and wire onClick →
// re-fetch through useClinicalTrials with the new sort token.

function ResultsToolbar({ totalCount, searchParams, classifyProgress }) {
  const summaryParts = [`${totalCount.toLocaleString()} trial${totalCount !== 1 ? 's' : ''}`]
  if (searchParams.location) summaryParts.push(`near ${searchParams.location}`)
  if (searchParams.location && searchParams.radius) summaryParts.push(`within ${searchParams.radius} mi`)
  const statusLabel = STATUS_LABELS[searchParams.status]
  if (statusLabel) summaryParts.push(statusLabel)
  if (searchParams.phases?.length) {
    summaryParts.push(searchParams.phases.map(p => PHASE_LABELS[p] ?? p).join(' / '))
  }

  return (
    <div className="px-4 sm:px-6 py-3 border-b border-parchment-200 flex flex-wrap items-center gap-x-6 gap-y-2">
      <p className="font-mono text-[11px] text-parchment-700 leading-snug">
        {summaryParts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className="text-parchment-300 mx-1.5" aria-hidden="true">·</span>}
            {part}
          </span>
        ))}
        {classifyProgress && classifyProgress.total > 0 && (
          <span className="ml-3 text-iris-700">
            <span className="text-parchment-300 mr-1.5" aria-hidden="true">·</span>
            {classifyProgress.done < classifyProgress.total
              ? `evaluating fit · ${classifyProgress.done} of ${classifyProgress.total}`
              : `fit evaluated for ${classifyProgress.total}`}
          </span>
        )}
      </p>
    </div>
  )
}

function CompareBar({ count, onClear }) {
  return (
    <div
      className="border-t border-parchment-200 bg-white px-4 py-2.5 flex items-center justify-between gap-3 shrink-0"
      style={{ boxShadow: '0 -4px 16px rgba(28, 24, 18, 0.06)' }}
      role="region"
      aria-label="Compare selection"
    >
      <span className="text-[13px] text-parchment-900">
        <strong className="font-semibold">{count}</strong> in compare
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] text-parchment-700 hover:text-parchment-950 px-2 py-1"
        >
          Clear
        </button>
        <button
          type="button"
          disabled
          title="Compare view coming soon"
          className="bg-iris-600 text-white px-4 py-1.5 rounded-md text-[13px] font-semibold opacity-60 cursor-not-allowed"
        >
          Compare →
        </button>
      </div>
    </div>
  )
}
