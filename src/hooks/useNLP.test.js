import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNLP } from './useNLP'
import { terminateSharedWorker } from '../workers/sharedNlpWorker'

// A reusable mock worker whose onmessage/onerror are set by the hook after creation.
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
}

beforeEach(() => {
  terminateSharedWorker()
  vi.clearAllMocks()
  mockWorker.onmessage = null
  mockWorker.onerror = null
  vi.stubGlobal('Worker', vi.fn(function () { return mockWorker }))
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

  it('posts a load message with modelId and isThinking to the worker', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load('Qwen3-1.7B-q4f32_1-MLC', { isThinking: true }))
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      modelId: 'Qwen3-1.7B-q4f32_1-MLC',
      isThinking: true,
      chatOpts: undefined,
    })
  })

  it('defaults isThinking to false when no options are passed', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load('gemma-2-2b-it-q4f32_1-MLC'))
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      modelId: 'gemma-2-2b-it-q4f32_1-MLC',
      isThinking: false,
      chatOpts: undefined,
    })
  })

  it('forwards chatOpts to the worker so per-model engine config can override prebuilt defaults', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load('gemma3-1b-it-q4f16_1-MLC', { chatOpts: { sliding_window_size: -1 } }))
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      modelId: 'gemma3-1b-it-q4f16_1-MLC',
      isThinking: false,
      chatOpts: { sliding_window_size: -1 },
    })
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
  it('does NOT terminate the shared worker on unmount (model is preserved across hook lifetime)', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result, unmount } = renderHook(() => useNLP())
    act(() => result.current.load())
    unmount()
    expect(mockWorker.terminate).not.toHaveBeenCalled()
  })
})

describe('useNLP — extract() guards', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  it('lazily creates the shared worker if extract() is called before load()', () => {
    const { result } = renderHook(() => useNLP())
    act(() => { result.current.extract('test') })
    // The shared worker should have been instantiated and received the extract message.
    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'extract')
    expect(call).toBeDefined()
    expect(call[0].text).toContain('test')
  })

  it('rejects concurrent extract() calls', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    act(() => { result.current.extract('first call') })
    await expect(result.current.extract('second call')).rejects.toThrow('Extraction already in progress')
  })
})

describe('useNLP — onerror handler', () => {
  it('sets error status when worker fires onerror', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onerror({ message: 'worker crash' }))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('worker crash')
  })
})
