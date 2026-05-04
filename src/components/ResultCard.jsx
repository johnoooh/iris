import PhaseExplainer from './PhaseExplainer'
import { nearestLocation } from '../utils/apiHelpers'

const STATUS_STYLES = {
  RECRUITING: 'bg-green-100 text-green-800',
  NOT_YET_RECRUITING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-600',
  TERMINATED: 'bg-red-100 text-red-700',
}

export default function ResultCard({ trial, coords }) {
  const nearest = nearestLocation(trial.locations, coords)

  return (
    <article className="bg-white border border-parchment-400 rounded-lg p-5 mb-3 max-w-3xl">
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

      {trial.summary && (
        <p className="text-sm text-parchment-900 leading-relaxed mb-3">{trial.summary}</p>
      )}

      {(trial.eligibility.minAge || trial.eligibility.sex !== 'ALL') && (
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
          className="text-parchment-800 underline hover:text-parchment-950"
        >
          View full details on ClinicalTrials.gov →
        </a>
        {trial.contact.phone && (
          <span className="text-parchment-700">{trial.contact.phone}</span>
        )}
        {trial.contact.email && (
          <a
            href={`mailto:${trial.contact.email}`}
            className="text-parchment-700 underline hover:text-parchment-950"
          >
            {trial.contact.email}
          </a>
        )}
      </div>
    </article>
  )
}
