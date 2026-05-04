import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import ResultsList from './ResultsList'

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

const mockTrial = {
  nctId: 'NCT001',
  title: 'A Study',
  status: 'RECRUITING',
  phases: ['PHASE2'],
  summary: 'Tests drug X.',
  eligibility: { minAge: '18 Years', maxAge: null, sex: 'ALL', criteria: '' },
  interventions: [],
  contact: {},
  locations: [],
  ctGovUrl: 'https://clinicaltrials.gov/study/NCT001',
}

describe('ResultsList', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('shows loading state', () => {
    fetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(
      <ResultsList searchParams={{ condition: 'cancer' }} />,
      { wrapper }
    )
    expect(screen.getByText(/searching/i)).toBeInTheDocument()
  })

  it('shows error message on API failure', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503 })
    render(
      <ResultsList searchParams={{ condition: 'cancer' }} />,
      { wrapper }
    )
    await screen.findByText(/couldn't reach ClinicalTrials.gov/i)
  })

  it('shows empty state with suggestions when no results', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ studies: [], totalCount: 0, nextPageToken: null }),
    })
    render(
      <ResultsList searchParams={{ condition: 'rare disease', location: 'Boston' }} />,
      { wrapper }
    )
    await screen.findByText(/no trials found/i)
    expect(screen.getByText(/removing the location filter/i)).toBeInTheDocument()
  })

  it('renders trial cards when results returned', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ studies: [
        { protocolSection: {
            identificationModule: { nctId: 'NCT001', briefTitle: 'A Study' },
            statusModule: { overallStatus: 'RECRUITING' },
        }}
      ], totalCount: 1, nextPageToken: null }),
    })
    render(
      <ResultsList searchParams={{ condition: 'cancer' }} />,
      { wrapper }
    )
    await screen.findByText('A Study')
  })

  it('shows geocoding fallback notice when location provided but geocode fails', async () => {
    fetch.mockImplementation(url => {
      if (url.includes('nominatim')) return Promise.reject(new Error('network error'))
      return new Promise(() => {}) // CT.gov stays loading — we only need the notice
    })
    render(
      <ResultsList searchParams={{ condition: 'cancer', location: 'somewhere' }} />,
      { wrapper }
    )
    await screen.findByText(/without distance filtering/i)
  })
})
