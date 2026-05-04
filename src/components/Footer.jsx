export default function Footer() {
  return (
    <footer className="bg-parchment-200 border-t border-parchment-400 px-6 py-5 mt-8">
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
    </footer>
  )
}
