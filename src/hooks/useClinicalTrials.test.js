import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useClinicalTrials } from './useClinicalTrials'

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

const mockStudy = {
  protocolSection: {
    identificationModule: { nctId: 'NCT001', briefTitle: 'A Study' },
    statusModule: { overallStatus: 'RECRUITING' },
  },
}

describe('useClinicalTrials', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('fetches and returns parsed trials', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ studies: [mockStudy], totalCount: 1, nextPageToken: null }),
    })
    const { result } = renderHook(
      () => useClinicalTrials({ condition: 'cancer' }, null),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data.pages[0].trials).toHaveLength(1)
    expect(result.current.data.pages[0].totalCount).toBe(1)
  })

  it('is disabled when condition is empty', () => {
    const { result } = renderHook(
      () => useClinicalTrials({ condition: '' }, null),
      { wrapper }
    )
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('sets isError on 429', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429 })
    const { result } = renderHook(
      () => useClinicalTrials({ condition: 'cancer' }, null),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error.message).toBe('RATE_LIMITED')
  })

  it('sets isError on 5xx', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    const { result } = renderHook(
      () => useClinicalTrials({ condition: 'cancer' }, null),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error.message).toBe('API_ERROR')
  })
})
