export default function Footer() {
  return (
    <footer className="no-print border-t border-parchment-200 px-6 py-5 mt-8 bg-parchment-50">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs text-parchment-800 leading-relaxed">
          IRIS is not medical advice. Always discuss clinical trial options with your healthcare
          provider.
          <br />
          IRIS is open source and collects no data.{' '}
          <a
            href="https://github.com/johnoooh/iris"
            className="underline hover:text-parchment-950"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>{' '}
          ·{' '}
          <a
            href="https://en.wikipedia.org/wiki/ACT_UP"
            className="underline hover:text-parchment-950"
            target="_blank"
            rel="noreferrer"
          >
            About Iris Long &amp; ACT-UP
          </a>
        </p>
        <details className="text-xs text-parchment-800">
          <summary className="cursor-pointer font-mono text-[11px] text-parchment-700 select-none">
            about iris
          </summary>
          <p className="mt-2 italic leading-relaxed max-w-2xl">
            Named for{' '}
            <strong className="not-italic font-semibold">Iris Long (1934–2026)</strong>, a
            pharmaceutical chemist and ACT-UP activist who dedicated her career to making clinical
            trial information accessible to the people who needed it most.
          </p>
        </details>
      </div>
    </footer>
  )
}
