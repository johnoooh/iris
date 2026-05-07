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
}) {
  const nearest = nearestLocation(trial.locations, coords)
  const wrapperClass = pane
    ? 'px-5 pt-5 pb-7 sm:px-7 sm:pt-7 sm:pb-9'
    : 'bg-white border border-parchment-400 rounded-lg p-5 mb-3 max-w-3xl'

  const sumState = simplification?.summarize
  const fitState = simplification?.fit

  const showPlainLanguage = sumState && sumState.status !== 'error'
  const showFallbackHint = sumState?.status === 'error'
  const showFit = fitState && fitState.status !== 'error' && fitState.text

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

          {showFit && (
            <div className={pane ? 'mb-4' : ''}>
              <SectionLabel pane={pane}>Why this might or might not fit you</SectionLabel>
              <p className={pane
                ? 'text-[15px] text-parchment-900 leading-[1.6] whitespace-pre-wrap'
                : 'text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap'}>
                {fitState.text}
              </p>
            </div>
          )}

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

      {pane ? (
        <div className="mt-6 pt-5 border-t border-parchment-200 flex flex-col gap-1.5 text-[13px]">
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
