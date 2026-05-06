import PhaseExplainer from './PhaseExplainer'
import { nearestLocation } from '../utils/apiHelpers'
import { UNSUPPORTED_LANGUAGE_HINTS } from '../utils/detectInputLanguage'

const STATUS_STYLES = {
  RECRUITING: 'bg-green-100 text-green-800',
  NOT_YET_RECRUITING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-600',
  TERMINATED: 'bg-red-100 text-red-700',
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
    ? 'px-7 py-6'
    : 'bg-white border border-parchment-400 rounded-lg p-5 mb-3 max-w-3xl'

  const sumState = simplification?.summarize
  const fitState = simplification?.fit

  const showPlainLanguage = sumState && sumState.status !== 'error'
  const showFallbackHint = sumState?.status === 'error'
  const showFit = fitState && fitState.status !== 'error' && fitState.text

  return (
    <article className={wrapperClass}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="text-base font-semibold text-parchment-950 leading-snug">{trial.title}</h3>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            STATUS_STYLES[trial.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {trial.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-parchment-800 mb-3">
        <PhaseExplainer phases={trial.phases} />
        {nearest && (
          <>
            <span className="text-parchment-500">·</span>
            <span>
              {nearest.facility ? `${nearest.facility}, ` : ''}
              {nearest.city}, {nearest.state}
            </span>
            <span className="text-parchment-500">·</span>
            <span>{nearest.distanceMi} mi away</span>
          </>
        )}
        {!nearest && trial.locations.length > 0 && (
          <>
            <span className="text-parchment-500">·</span>
            <span>
              {trial.locations[0].city}, {trial.locations[0].state}
            </span>
          </>
        )}
      </div>

      {/* PLAIN-LANGUAGE BLOCK — only when simplification is present */}
      {showPlainLanguage && (
        <div className="mb-3">
          <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
            What this study is testing
          </h4>
          <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
            {sumState.summary || ' '}
          </p>

          {sumState.eligibility != null && (
            <>
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
                Who can join
              </h4>
              <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
                {sumState.eligibility || ' '}
              </p>
            </>
          )}

          {showFit && (
            <>
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
                Why this might or might not fit you
              </h4>
              <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
                {fitState.text}
              </p>
            </>
          )}

          {(sumState.status === 'queued' || sumState.status === 'streaming') && (
            <p className="text-xs text-parchment-600 italic mb-2">
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

      {/* ON-DEMAND BUTTON — when no simplification yet and a callback is wired */}
      {!simplification && onRequestSimplify && simplificationSupported && (
        <button
          type="button"
          onClick={() => onRequestSimplify(trial)}
          className="text-xs text-parchment-800 underline hover:text-parchment-950 mb-2"
        >
          Show in plain language
        </button>
      )}

      {/* UNSUPPORTED-LANGUAGE HINT — when the user typed in a language the
          local model can't reliably simplify (Mandarin, Arabic, etc.). The
          hint duplicates the call-to-action in the user's likely script
          plus English so it's actionable before they invoke browser translate. */}
      {!simplificationSupported && (
        <p
          className="text-xs text-parchment-700 italic mb-3"
          dir={inputLanguage === 'ar' ? 'rtl' : 'ltr'}
        >
          {UNSUPPORTED_LANGUAGE_HINTS[inputLanguage] ?? UNSUPPORTED_LANGUAGE_HINTS.other}
        </p>
      )}

      {/* ORIGINAL PROSE — shown when no simplification (default Phase 1 path) */}
      {!showPlainLanguage && trial.summary && (
        <p className="text-sm text-parchment-900 leading-relaxed mb-3">{trial.summary}</p>
      )}

      {/* FAILURE HINT */}
      {showFallbackHint && (
        <p className="text-xs text-parchment-600 italic mb-3">
          Plain-language version unavailable for this trial.
        </p>
      )}

      {/* Existing eligibility-summary line — only when no simplification */}
      {(trial.eligibility.minAge || trial.eligibility.sex !== 'ALL') && !showPlainLanguage && (
        <p className="text-xs text-parchment-800 mb-3">
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
    </article>
  )
}
