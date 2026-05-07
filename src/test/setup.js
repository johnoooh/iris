import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't ship matchMedia; ResultsList uses it for the mobile
// breakpoint detector. Stub it to "desktop" (does-not-match) by default
// so the two-pane code path renders in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),       // legacy
    removeListener: vi.fn(),    // legacy
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  cleanup()
})
