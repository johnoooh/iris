import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNLP } from './useNLP'

// A reusable mock worker whose onmessage/onerror are set by the hook after creation.
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWorker.onmessage = null
  mockWorker.onerror = null
  vi.stubGlobal('Worker', vi.fn(() => mockWorker))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNLP — initial state', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useNLP())
    expect(result.current.status).toBe('idle')
  })

  it('reports webGPUSupported: false in jsdom (no navigator.gpu)', () => {
    const { result } = renderHook(() => useNLP())
    expect(result.current.webGPUSupported).toBe(false)
  })

  it('reports webGPUSupported: true when navigator.gpu exists', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result } = renderHook(() => useNLP())
    expect(result.current.webGPUSupported).toBe(true)
  })
})

describe('useNLP — load()', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  it('transitions to downloading when load() is called', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    expect(result.current.status).toBe('downloading')
  })

  it('posts { type: "load" } to the worker', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'load' })
  })

  it('transitions to ready when worker posts ready', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))
    expect(result.current.status).toBe('ready')
  })

  it('updates progress when worker posts progress', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'progress', progress: { progress: 0.5, text: 'Loading...' } } }))
    expect(result.current.progress).toEqual({ progress: 0.5, text: 'Loading...' })
  })

  it('transitions to error when worker posts error during load', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'error', message: 'load failed' } }))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('load failed')
  })
})

describe('useNLP — extract()', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  it('transitions to extracting and resolves with parsed fields', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    let fields
    const extractPromise = act(async () => {
      fields = await result.current.extract('breast cancer woman in Brooklyn aged 52')
    })

    act(() => mockWorker.onmessage({
      data: { type: 'result', raw: '{"condition":"breast cancer","location":"Brooklyn","age":52,"sex":"FEMALE"}' },
    }))

    await extractPromise
    expect(fields.condition).toBe('breast cancer')
    expect(fields.location).toBe('Brooklyn')
    expect(fields.age).toBe(52)
    expect(result.current.status).toBe('ready')
  })

  it('posts the built prompt to the worker', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    act(() => { result.current.extract('test input') })

    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'extract')
    expect(call[0].text).toContain('test input')
    expect(call[0].text).toContain('Return ONLY valid JSON')
  })

  it('returns to ready with null fields on worker error during extraction', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    let fields
    const extractPromise = act(async () => {
      fields = await result.current.extract('test')
    })

    act(() => mockWorker.onmessage({ data: { type: 'error', message: 'inference failed' } }))
    await extractPromise

    expect(fields).toBeNull()
    expect(result.current.status).toBe('ready')
  })
})

describe('useNLP — cleanup', () => {
  it('terminates the worker on unmount', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result, unmount } = renderHook(() => useNLP())
    act(() => result.current.load())
    unmount()
    expect(mockWorker.terminate).toHaveBeenCalled()
  })
})
