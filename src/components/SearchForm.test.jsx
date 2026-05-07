import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchForm from './SearchForm'

describe('SearchForm', () => {
  it('renders condition field as required', () => {
    render(<SearchForm onSearch={vi.fn()} />)
    expect(screen.getByLabelText(/condition/i)).toBeRequired()
  })

  it('hides radius selector when location is empty', () => {
    render(<SearchForm onSearch={vi.fn()} />)
    expect(screen.queryByLabelText(/radius/i)).not.toBeInTheDocument()
  })

  it('shows radius selector when location is entered', async () => {
    const user = userEvent.setup()
    render(<SearchForm onSearch={vi.fn()} />)
    await user.type(screen.getByLabelText(/location/i), 'Brooklyn')
    expect(screen.getByLabelText(/radius/i)).toBeInTheDocument()
  })

  it('calls onSearch with correct params on submit', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchForm onSearch={onSearch} />)
    await user.type(screen.getByLabelText(/condition/i), 'lung cancer')
    fireEvent.click(screen.getByRole('button', { name: /find trials/i }))
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'lung cancer' })
    )
  })

  it('does not submit when condition is empty', async () => {
    const onSearch = vi.fn()
    render(<SearchForm onSearch={onSearch} />)
    fireEvent.click(screen.getByRole('button', { name: /find trials/i }))
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('SearchForm prefill', () => {
  it('pre-fills condition from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ condition: 'lung cancer' }} />)
    expect(screen.getByLabelText(/condition/i)).toHaveValue('lung cancer')
  })

  it('pre-fills location from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ location: 'Brooklyn' }} />)
    expect(screen.getByLabelText(/location/i)).toHaveValue('Brooklyn')
  })

  it('pre-fills age from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ age: 52 }} />)
    expect(screen.getByLabelText(/age/i)).toHaveValue(52)
  })

  it('includes prefill condition in onSearch call', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchForm onSearch={onSearch} prefill={{ condition: 'breast cancer' }} />)
    fireEvent.click(screen.getByRole('button', { name: /find trials/i }))
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'breast cancer' })
    )
  })

  it('updates prefilled fields when prefill prop changes', () => {
    const { rerender } = render(
      <SearchForm onSearch={vi.fn()} prefill={{ condition: 'cancer' }} />
    )
    expect(screen.getByLabelText(/condition/i)).toHaveValue('cancer')
    rerender(<SearchForm onSearch={vi.fn()} prefill={{ condition: 'diabetes' }} />)
    expect(screen.getByLabelText(/condition/i)).toHaveValue('diabetes')
  })

  it('removes highlight class when user edits a prefilled condition field', async () => {
    const user = userEvent.setup()
    render(<SearchForm onSearch={vi.fn()} prefill={{ condition: 'cancer' }} />)
    const input = screen.getByLabelText(/condition/i)
    expect(input.className).toMatch(/bg-parchment-100/)
    await user.clear(input)
    await user.type(input, 'diabetes')
    expect(input.className).not.toMatch(/bg-parchment-100/)
  })
})
