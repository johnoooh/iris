import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useGeocode } from './useGeocode'

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns coords when Nominatim responds', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '40.7484', lon: '-73.9967' }],
    })
    const { result } = renderHook(() => useGeocode('10001'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ lat: 40.7484, lng: -73.9967 })
  })

  it('returns null when Nominatim returns empty array', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] })
    const { result } = renderHook(() => useGeocode('99999'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('is disabled when location is empty string', () => {
    const { result } = renderHook(() => useGeocode(''), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('sends correct User-Agent header', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '42.36', lon: '-71.06' }],
    })
    renderHook(() => useGeocode('Boston'), { wrapper })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [, options] = fetch.mock.calls[0]
    expect(options.headers['User-Agent']).toBe('IRIS-ClinicalTrialFinder/1.0')
  })
})
