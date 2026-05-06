export default function PrivacyStatement() {
  return (
    <div className="border-b border-parchment-200 px-6 py-2 bg-parchment-50">
      <details className="group text-xs text-parchment-800">
        <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-iris-50 text-iris-700"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 5V3.5a3 3 0 1 1 6 0V5M2.5 5h7v5h-7z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-mono text-[11px] text-iris-700">on-device only</span>
          <span className="text-parchment-700">— what this means</span>
        </summary>
        <p className="mt-2 ml-[22px] max-w-2xl leading-relaxed">
          Your information never leaves your device. IRIS collects no data, uses no cookies,
          requires no account, and has no tracking. The only network request is a structured
          search query to ClinicalTrials.gov&apos;s public database.
        </p>
      </details>
    </div>
  )
}
