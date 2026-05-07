import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NaturalLanguageInput from './NaturalLanguageInput'

// Mock useNLP so tests never touch the real worker or WebLLM
vi.mock('../hooks/useNLP', () => ({
  useNLP: vi.fn(),
}))

import { useNLP } from '../hooks/useNLP'

const baseHook = {
  status: 'idle',
  progress: null,
  error: null,
  webGPUSupported: true,
  load: vi.fn(),
  extract: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('NaturalLanguageInput — WebGPU unavailable', () => {
  it('shows Unavailable badge', () => {
    useNLP.mockReturnValue({ ...baseHook, webGPUSupported: false })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('shows browser requirement message', () => {
    useNLP.mockReturnValue({ ...baseHook, webGPUSupported: false })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByText(/WebGPU-capable browser/i)).toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — consent screen', () => {
  it('shows consent screen when no prior consent and WebGPU available', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'idle' })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByText(/One-time setup/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download & enable/i })).toBeInTheDocument()
  })

  it('calls load() and saves consent flag when user clicks Download', () => {
    const load = vi.fn()
    useNLP.mockReturnValue({ ...baseHook, load })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    fireEvent.click(screen.getByRole('button', { name: /Download & enable/i }))
    expect(load).toHaveBeenCalled()
    expect(localStorage.getItem('iris_nlp_enabled')).toBe('true')
  })

  it('collapses panel when user clicks Not now', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'idle' })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }))
    expect(screen.queryByText(/One-time setup/i)).not.toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — downloading state', () => {
  it('shows progress bar when status is downloading', () => {
    useNLP.mockReturnValue({
      ...baseHook,
      status: 'downloading',
      progress: { progress: 0.62, text: 'Fetching model...' },
    })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByText(/Fetching model/i)).toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — ready state', () => {
  it('shows enabled textarea when status is ready', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'ready' })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByRole('textbox', { name: /natural language search/i })).not.toBeDisabled()
  })

  it('calls extract() and onExtract() when user submits text', async () => {
    const user = userEvent.setup()
    const extract = vi.fn().mockResolvedValue({ condition: 'breast cancer', sex: 'FEMALE', age: 52 })
    const onExtract = vi.fn()
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={onExtract} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    await user.type(screen.getByRole('textbox', { name: /natural language search/i }), '52yo woman with breast cancer')
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await waitFor(() => expect(onExtract).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ condition: 'breast cancer' }),
        description: expect.any(String),
      })
    ))
  })
})

describe('NaturalLanguageInput — confirmation card', () => {
  it('shows extracted fields as chips after extraction', async () => {
    const extract = vi.fn().mockResolvedValue({
      condition: 'breast cancer', location: 'Brooklyn', age: 52, sex: 'FEMALE',
      status: 'RECRUITING', phases: [],
    })
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /natural language search/i }), {
      target: { value: '52yo woman with breast cancer in Brooklyn' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await screen.findByText(/understood:/i)
    expect(screen.getByText('breast cancer')).toBeInTheDocument()
    expect(screen.getByText('Brooklyn')).toBeInTheDocument()
  })

  it('shows missing condition warning when condition is null', async () => {
    const extract = vi.fn().mockResolvedValue({ condition: null, sex: 'ALL', status: 'RECRUITING', phases: [] })
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /natural language search/i }), {
      target: { value: 'something unclear' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await screen.findByText(/couldn't determine condition/i)
  })
})

describe('NaturalLanguageInput — error state', () => {
  it('shows retry option when status is error', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'error', error: 'load failed' })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))
    expect(screen.getByText(/try again/i)).toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — queued submit during download', () => {
  // Locks in the typing-while-loading flow: a user can hit Find trials while
  // the model is still downloading; the intent is held until status flips to
  // 'ready' and then auto-fires. Indirect smoke test for the StrictMode
  // listener fix in useNLP — if the listener didn't re-attach after the dev
  // double-invoke, the real-world status would never reach 'ready' and the
  // drain effect (deps [status, pendingSubmit]) would never fire.
  it('queues submit while downloading, fires extract once status flips to ready', async () => {
    const extract = vi.fn().mockResolvedValue({
      condition: 'breast cancer', location: null, age: 58, sex: 'FEMALE',
      status: 'RECRUITING', phases: [],
    })
    useNLP.mockReturnValue({ ...baseHook, status: 'downloading', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    const onExtract = vi.fn()
    const { rerender } = render(<NaturalLanguageInput onExtract={onExtract} />)
    fireEvent.click(screen.getByRole('button', { name: /describe in your own words/i }))

    fireEvent.change(screen.getByRole('textbox', { name: /natural language search/i }), {
      target: { value: '58 with breast cancer' },
    })

    // Submit while downloading — should queue, NOT fire extract yet.
    fireEvent.click(screen.getByRole('button', { name: /Run when ready/i }))
    expect(extract).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Queued/i })).toBeInTheDocument()

    // Worker reports ready. In production this comes via the listener that
    // the StrictMode fix ensures stays attached after the cleanup-remount.
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    rerender(<NaturalLanguageInput onExtract={onExtract} />)

    await waitFor(() => expect(extract).toHaveBeenCalledWith('58 with breast cancer'))
    await waitFor(() => expect(onExtract).toHaveBeenCalled())
  })
})
