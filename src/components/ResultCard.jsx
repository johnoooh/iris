import PhaseExplainer from './PhaseExplainer'
import { nearestLocation } from '../utils/apiHelpers'
import { UNSUPPORTED_LANGUAGE_HINTS } from '../utils/detectInputLanguage'

const STATUS_STYLES = {
  RECRUITING: 'bg-green-100 text-green-800',
  NOT_YET_RECRUITING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-600',
  TERMINATED: 'bg-red-100 text-red-700',
}

function StatusPill({ status }) {
  return (
    <span
      className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {status}
    </span>
  )
}

function SectionLabel({ children, pane }) {
  if (pane) {
    return (
      <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 mb-2">
        {children}
      </h4>
    )
  }
  return (
    <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
      {children}
    </h4>
  )
}

// Two-stage on-device pipeline status. Renders only in pane (detail) view
// because the row already has a fit dot indicator. Tells the user
// explicitly which stage is in flight so the empty content area below
// doesn't read as "broken".
function PipelineCaption({ stage, progress }) {
  if (stage === 'classifying') {
    return (
      <div className="mb-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-iris-50 border border-iris-100">
        <span className="iris-shimmer-text inline-block w-2 h-2 rounded-full" aria-hidden="true">&nbsp;</span>
        <span className="font-mono text-[11px] text-iris-700">
          evaluating fit
          {progress && progress.total > 0 && ` · ${progress.done} of ${progress.total}`}
          <span className="text-parchment-700"> · plain-language summary will follow</span>
        </span>
      </div>
    )
  }
  if (stage === 'awaiting-summary') {
    return (
      <div className="mb-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-parchment-100 border border-parchment-200">
        <span className="iris-shimmer-text inline-block w-2 h-2 rounded-full" aria-hidden="true">&nbsp;</span>
        <span className="font-mono text-[11px] text-parchment-700">
          generating plain-language summary…
        </span>
      </div>
    )
  }
  return null
}

function MetaLine({ trial, nearest, pane }) {
  const sep = (
    <span aria-hidden="true" className={pane ? 'text-parchment-300' : 'text-parchment-500'}>
      ·
    </span>
  )
  const baseClass = pane
    ? 'font-mono text-[12px] text-parchment-700 flex flex-wrap items-center gap-x-3.5 gap-y-1 mb-5'
    : 'flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-parchment-800 mb-3'

  return (
    <div className={baseClass}>
      <PhaseExplainer phases={trial.phases} />
      {nearest && (
        <>
          {sep}
          <span>
            {nearest.facility ? `${nearest.facility}, ` : ''}
            {nearest.city}, {nearest.state}
          </span>
          {sep}
          <span>{nearest.distanceMi} mi away</span>
        </>
      )}
      {!nearest && trial.locations.length > 0 && (
        <>
          {sep}
          <span>
            {trial.locations[0].city}, {trial.locations[0].state}
          </span>
        </>
      )}
    </div>
  )
}

export default function ResultCard({
  trial,
  coords,
  simplification,
  onRequestSimplify,
  inputLanguage = 'en',
  simplificationSupported = true,
  pane = false,
  pipelineStage = null, // 'classifying' | 'awaiting-summary' | null
  classifyProgress = null, // { done, total }
}) {
  const nearest = nearestLocation(trial.locations, coords)
  const wrapperClass = pane
    ? 'px-5 pt-5 pb-7 sm:px-7 sm:pt-7 sm:pb-9'
    : 'bg-white border border-parchment-400 rounded-lg p-5 mb-3 max-w-3xl'

  const sumState = simplification?.summarize
  // fitState/showFit removed when the "Why this might or might not fit you"
  // section was dropped — Gemma 2B's accuracy on the fit narrative wasn't
  // reliable enough to ship. Re-introduce both if the fit section comes
  // back behind a fine-tuned model.
  const showPlainLanguage = sumState && sumState.status !== 'error'
  const showFallbackHint = sumState?.status === 'error'

  return (
    <article className={wrapperClass}>
      {pane ? (
        <>
          <div className="flex items-center justify-between gap-4 mb-3">
            <StatusPill status={trial.status} />
          </div>
          <h2 className="font-serif font-semibold text-[24px] leading-[1.2] tracking-tight text-parchment-950 mb-2">
            {trial.title}
          </h2>
        </>
      ) : (
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-base font-semibold text-parchment-950 leading-snug">{trial.title}</h3>
          <StatusPill status={trial.status} />
        </div>
      )}

      <MetaLine trial={trial} nearest={nearest} pane={pane} />

      {pane && pipelineStage && (
        <PipelineCaption stage={pipelineStage} progress={classifyProgress} />
      )}

      {showPlainLanguage && (
        <div className={pane ? 'mb-4' : 'mb-3'}>
          <div className={pane ? 'mb-4' : ''}>
            <SectionLabel pane={pane}>What this study is testing</SectionLabel>
            <p className={pane
              ? 'text-[15px] text-parchment-900 leading-[1.6] whitespace-pre-wrap'
              : 'text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap'}>
              {sumState.summary || ' '}
            </p>
          </div>

          {sumState.eligibility != null && (
            <div className={pane ? 'mb-4' : ''}>
              <SectionLabel pane={pane}>Who can join</SectionLabel>
              <p className={pane
                ? 'text-[15px] text-parchment-900 leading-[1.6] whitespace-pre-wrap'
                : 'text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap'}>
                {sumState.eligibility || ' '}
              </p>
            </div>
          )}

          {/* "Why this might or might not fit you" intentionally omitted —
              Gemma 2B's accuracy on the fit narrative isn't reliable
              enough to ship. The TriageRow fit dot (driven by the
              classifier) is the safer signal. The DoctorDisclaimer
              below renders unconditionally to set expectations. */}

          {(sumState.status === 'queued' || sumState.status === 'streaming') && (
            <p className="font-mono text-[11px] text-parchment-700 italic mb-2">
              Generating plain-language summary…
            </p>
          )}

          {sumState.status === 'complete' && trial.summary && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-parchment-700 hover:text-parchment-950">
                Show clinical summary
              </summary>
              <div className="mt-2 pl-3 border-l-2 border-parchment-300">
                <p className="text-sm text-parchment-900 leading-relaxed mb-2">{trial.summary}</p>
                {trial.eligibility?.criteria && (
                  <p className="text-xs text-parchment-800 whitespace-pre-wrap">
                    <span className="font-medium">Eligibility:</span>{' '}
                    {trial.eligibility.criteria}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {!simplification && onRequestSimplify && simplificationSupported && (
        <button
          type="button"
          onClick={() => onRequestSimplify(trial)}
          className={pane
            ? 'text-[13px] text-iris-700 hover:text-iris-900 underline mb-3'
            : 'text-xs text-parchment-800 underline hover:text-parchment-950 mb-2'}
        >
          Show in plain language
        </button>
      )}

      {!simplificationSupported && (
        <p
          className="text-xs text-parchment-700 italic mb-3"
          dir={inputLanguage === 'ar' ? 'rtl' : 'ltr'}
        >
          {UNSUPPORTED_LANGUAGE_HINTS[inputLanguage] ?? UNSUPPORTED_LANGUAGE_HINTS.other}
        </p>
      )}

      {!showPlainLanguage && trial.summary && (
        <div className={pane ? 'mb-4' : ''}>
          {pane && <SectionLabel pane>What this study is testing</SectionLabel>}
          <p className={pane
            ? 'text-[15px] text-parchment-900 leading-[1.6]'
            : 'text-sm text-parchment-900 leading-relaxed mb-3'}>
            {trial.summary}
          </p>
        </div>
      )}

      {showFallbackHint && (
        <p className="font-mono text-[11px] text-parchment-700 italic mb-3">
          Plain-language version unavailable for this trial.
        </p>
      )}

      {(trial.eligibility.minAge || trial.eligibility.sex !== 'ALL') && !showPlainLanguage && (
        <p className={pane
          ? 'font-mono text-[11px] text-parchment-700 mb-4'
          : 'text-xs text-parchment-800 mb-3'}>
          <span className="font-medium">Who can join:</span>{' '}
          {[
            trial.eligibility.minAge && `${trial.eligibility.minAge}+`,
            trial.eligibility.sex !== 'ALL' &&
              trial.eligibility.sex.charAt(0) + trial.eligibility.sex.slice(1).toLowerCase(),
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}

      {pane && (
        <details className="mt-6 mb-2 px-4 py-3 rounded-lg bg-iris-50 border border-iris-100 group">
          <summary className="cursor-pointer list-none text-[13px] text-parchment-900 leading-relaxed select-none">
            <span className="font-semibold text-iris-700">Check with your doctor when exploring treatment options</span>
            {' '}— this AI summary uses plain language to explain the treatment but can miss
            eligibility details.
            <span className="font-mono text-[11px] text-iris-700 ml-2 opacity-70 group-open:hidden">
              why?
            </span>
          </summary>
          <p className="mt-3 text-[13px] text-parchment-900 leading-relaxed">
            The plain-language summary above was generated on your device by a small AI model. It
            can miss or misstate who qualifies for a trial. Your care team has your full medical
            picture and can confirm whether this one actually fits.
          </p>
        </details>
      )}

      {pane ? (
        <div className="mt-4 pt-5 border-t border-parchment-200 flex flex-col gap-1.5 text-[13px]">
          <div className="font-mono text-[11px] text-parchment-700 mb-1">contact</div>
          {trial.contact.phone && (
            <span className="text-parchment-900">{trial.contact.phone}</span>
          )}
          {trial.contact.email && (
            <a
              href={`mailto:${trial.contact.email}`}
              className="text-iris-700 hover:text-iris-900"
            >
              {trial.contact.email}
            </a>
          )}
          <a
            href={trial.ctGovUrl}
            target="_blank"
            rel="noreferrer"
            className="text-iris-700 hover:text-iris-900 font-medium mt-2"
          >
            View full details on ClinicalTrials.gov →
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <a
            href={trial.ctGovUrl}
            target="_blank"
            rel="noreferrer"
            className="text-iris-700 hover:text-iris-900 font-medium"
          >
            View full details on ClinicalTrials.gov →
          </a>
          {trial.contact.phone && (
            <span className="text-parchment-800">{trial.contact.phone}</span>
          )}
          {trial.contact.email && (
            <a
              href={`mailto:${trial.contact.email}`}
              className="text-iris-700 hover:text-iris-900 underline"
            >
              {trial.contact.email}
            </a>
          )}
        </div>
      )}
    </article>
  )
}
