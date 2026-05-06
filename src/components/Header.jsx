export default function Header() {
  return (
    <header className="border-b border-parchment-200 px-7 py-5 flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-3.5">
        <span className="font-serif font-semibold text-[26px] tracking-tight text-parchment-950 lowercase">
          iris
        </span>
        <span className="font-serif italic text-parchment-700 text-[13px]">
          clinical trial finder
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span
          title="Your data never leaves the device"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-parchment-700"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3 5V3.5a3 3 0 1 1 6 0V5M2.5 5h7v5h-7z"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          on-device only
        </span>
        <LocalAIBadge />
      </div>
    </header>
  )
}

function LocalAIBadge({ active = false, label = 'Gemma 2 2B · on-device' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-iris-700 bg-iris-50 border border-iris-100 px-2 py-[3px] rounded-full"
      aria-label={`Local AI model: ${label}`}
    >
      <span
        className={active ? 'iris-pulse' : ''}
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: active ? 'var(--iris-500)' : 'var(--iris-300)',
        }}
      />
      {label}
    </span>
  )
}
