import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const trial = {
  nctId: 'NCT001',
  title: 'Drug X for Y',
  status: 'RECRUITING',
  phases: ['PHASE2'],
  summary: 'A Phase 2 study of drug X.',
  eligibility: { criteria: 'Adults 18+.', minAge: '18 Years', sex: 'ALL' },
  interventions: [],
  contact: {},
  locations: [],
  ctGovUrl: 'https://example.com',
}

describe('ResultCard — Phase 3 simplification', () => {
  it('renders only the original prose when no simplification prop is provided', () => {
    render(<ResultCard trial={trial} coords={null} />)
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
    expect(screen.queryByText(/What this study is testing/i)).not.toBeInTheDocument()
  })

  it('renders the on-demand button when simplification is undefined and onRequestSimplify is provided', () => {
    render(
      <ResultCard
        trial={trial}
        coords={null}
        simplification={undefined}
        onRequestSimplify={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /show in plain language/i })).toBeInTheDocument()
  })

  it('calls onRequestSimplify when the on-demand button is clicked', () => {
    const onRequestSimplify = vi.fn()
    render(
      <ResultCard
        trial={trial}
        coords={null}
        simplification={undefined}
        onRequestSimplify={onRequestSimplify}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show in plain language/i }))
    expect(onRequestSimplify).toHaveBeenCalledWith(trial)
  })

  it('renders the streaming summary as it grows', () => {
    const simplification = {
      summarize: { status: 'streaming', summary: 'This study tests', eligibility: null, error: null },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('This study tests')).toBeInTheDocument()
    // The "generating…" caption used to render here; it now lives only in
    // the parent's PipelineCaption (pane mode). Once tokens stream the
    // user sees the actual text, so the caption is gone.
  })

  it('renders both sections when both have streamed', () => {
    const simplification = {
      summarize: {
        status: 'streaming',
        summary: 'Plain summary.',
        eligibility: 'Plain eligibility.',
        error: null,
      },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('Plain summary.')).toBeInTheDocument()
    expect(screen.getByText('Plain eligibility.')).toBeInTheDocument()
  })

  it('renders the collapsible "Show clinical summary" with the original prose when complete', () => {
    const simplification = {
      summarize: {
        status: 'complete',
        summary: 'Plain summary.',
        eligibility: 'Plain eligibility.',
        error: null,
      },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText(/Show clinical summary/i)).toBeInTheDocument()
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
  })

  it('falls back to the original prose with hint when summarize errors', () => {
    const simplification = {
      summarize: { status: 'error', summary: '', eligibility: null, error: 'engine crashed' },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
    expect(screen.getByText(/Plain-language version unavailable/i)).toBeInTheDocument()
  })

  // The "Why this might or might not fit you" section was removed because
  // Gemma 2B's accuracy on the fit narrative wasn't reliable enough to
  // ship — it occasionally flipped disease stage or treatment history.
  // The TriageRow fit dot (driven by the binary classifier in
  // useClassifier) is the safer signal. The simplifier still computes
  // assess_fit when called; ResultCard just no longer renders it.
  it('does not render the fit paragraph even when fit state is complete', () => {
    const simplification = {
      summarize: { status: 'complete', summary: 'Sum.', eligibility: 'Elig.', error: null },
      fit: { status: 'complete', text: 'This may fit you because…', error: null },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.queryByText(/Why this might or might not fit you/i)).not.toBeInTheDocument()
    expect(screen.queryByText('This may fit you because…')).not.toBeInTheDocument()
  })
})
