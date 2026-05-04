import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhaseExplainer from './PhaseExplainer'

describe('PhaseExplainer', () => {
  it('renders the phase label', () => {
    render(<PhaseExplainer phases={['PHASE2']} />)
    expect(screen.getByText('Phase 2')).toBeInTheDocument()
  })

  it('shows tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<PhaseExplainer phases={['PHASE2']} />)
    await user.hover(screen.getByText('Phase 2'))
    expect(
      screen.getByText(/Testing whether the treatment works/i)
    ).toBeInTheDocument()
  })

  it('renders multiple phases comma-separated', () => {
    render(<PhaseExplainer phases={['PHASE1', 'PHASE2']} />)
    expect(screen.getByText('Phase 1 / Phase 2')).toBeInTheDocument()
  })

  it('renders "N/A" for empty phases', () => {
    render(<PhaseExplainer phases={[]} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })
})
