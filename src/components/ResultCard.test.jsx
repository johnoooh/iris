import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResultCard from './ResultCard'

const mockTrial = {
  nctId: 'NCT001',
  title: 'Pembrolizumab in Triple Negative Breast Cancer',
  status: 'RECRUITING',
  phases: ['PHASE2'],
  summary: 'Tests whether adding pembrolizumab improves outcomes.',
  eligibility: { minAge: '18 Years', maxAge: 'N/A', sex: 'ALL', criteria: '' },
  interventions: [{ type: 'DRUG', name: 'Pembrolizumab' }],
  contact: { phone: '555-1234', email: 'study@example.com' },
  locations: [{ facility: 'MSKCC', city: 'New York', state: 'New York', country: 'United States', geoPoint: { lat: 40.76, lon: -73.95 } }],
  ctGovUrl: 'https://clinicaltrials.gov/study/NCT001',
}

describe('ResultCard', () => {
  it('renders trial title', () => {
    render(<ResultCard trial={mockTrial} coords={null} />)
    expect(screen.getByText(mockTrial.title)).toBeInTheDocument()
  })

  it('renders RECRUITING badge', () => {
    render(<ResultCard trial={mockTrial} coords={null} />)
    expect(screen.getByText('RECRUITING')).toBeInTheDocument()
  })

  it('renders link to ClinicalTrials.gov', () => {
    render(<ResultCard trial={mockTrial} coords={null} />)
    const link = screen.getByRole('link', { name: /view full details/i })
    expect(link).toHaveAttribute('href', mockTrial.ctGovUrl)
  })

  it('renders distance when coords provided', () => {
    render(<ResultCard trial={mockTrial} coords={{ lat: 40.748, lng: -73.996 }} />)
    expect(screen.getByText(/mi away/i)).toBeInTheDocument()
  })

  it('does not render distance when coords null', () => {
    render(<ResultCard trial={mockTrial} coords={null} />)
    expect(screen.queryByText(/mi away/i)).not.toBeInTheDocument()
  })

  it('renders contact phone', () => {
    render(<ResultCard trial={mockTrial} coords={null} />)
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })
})
