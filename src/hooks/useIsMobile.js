import { useEffect, useState } from 'react'

export const MOBILE_BREAKPOINT_PX = 820

// matchMedia (not 'resize'): iOS Safari fires 'resize' inconsistently on
// rotation; matchMedia.change is the reliable signal. Also catches iPad
// split-screen and browser-window mode switches without a manual resize.
export function useIsMobile() {
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
