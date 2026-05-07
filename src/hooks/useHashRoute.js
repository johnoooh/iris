import { useEffect, useState } from 'react'

// Tiny hash-route hook. Why hash routing instead of React Router:
// IRIS only needs one extra route today (/compare). Pulling React Router
// in for that one route would add ~20 KB and rewire App.jsx; a 25-line
// hook is enough.
//
// `route` is the hash with the leading '#' stripped (e.g. "/compare").
// `navigate(target)` accepts either '/foo' or '#/foo'; both work.
export function useHashRoute() {
  const [hash, setHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : ''
  )

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(target) {
    const next = target.startsWith('#') ? target.slice(1) : target
    window.location.hash = next
  }

  return { route: hash.replace(/^#/, ''), navigate }
}
