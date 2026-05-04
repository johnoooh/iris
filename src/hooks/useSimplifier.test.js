import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSimplifier } from './useSimplifier'

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
  vi.stubGlobal('Worker', vi.fn(function () { return mockWorker }))
  vi.stubGlobal('navigator', { gpu: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const trial = {
  nctId: 'NCT001',
  summary: 'A Phase 3 study of drug X.',
  eligibility: { criteria: 'Adults 18+.' },
}

const props = {
  modelKey: 'gemma',
  userDescription: null,
  extractedFields: null,
}

describe('useSimplifier — initial state', () => {
  it('starts with empty states map', () => {
    const { result } = renderHook(() => useSimplifier(props))
    expect(result.current.states.size).toBe(0)
  })
})

describe('useSimplifier — enqueueSummarize', () => {
  it('marks the trial as queued and posts a summarize message to the worker', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.status).toMatch(/queued|streaming/)
    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')
    expect(call).toBeDefined()
    expect(call[0].prompt).toContain('A Phase 3 study of drug X.')
    expect(typeof call[0].taskId).toBe('string')
  })

  it('is a no-op when the trial is already cached as complete', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n## Who can join\nBar.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    mockWorker.postMessage.mockClear()
    act(() => result.current.enqueueSummarize(trial))
    expect(mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')).toBeUndefined()
  })

  it('updates summary as chunks stream in (delimiter not yet emitted)', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nThis study tests' } }))
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: ' a new drug.' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.summary).toBe('This study tests a new drug.')
    expect(state.summarize.eligibility).toBeNull()
  })

  it('splits summary and eligibility once the delimiter chunk arrives', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n\n## Who can join\nAdults 18+.' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.summary).toBe('Foo.')
    expect(state.summarize.eligibility).toBe('Adults 18+.')
  })

  it('marks status complete on task_done', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n## Who can join\nBar.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    expect(result.current.states.get('NCT001').summarize.status).toBe('complete')
  })

  it('marks status error and stores message on task_error', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_error', taskId, message: 'engine crashed' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.status).toBe('error')
    expect(state.summarize.error).toBe('engine crashed')
  })
})

describe('useSimplifier — enqueueAssessFit', () => {
  it('is a no-op when no extractedFields are provided', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueAssessFit(trial))
    expect(mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')).toBeUndefined()
  })

  it('posts an assess_fit message when extractedFields exist', () => {
    const withFields = { ...props, extractedFields: { condition: 'cancer', age: 50, sex: 'FEMALE' } }
    const { result } = renderHook(() => useSimplifier(withFields))
    act(() => result.current.enqueueAssessFit(trial))
    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')
    expect(call).toBeDefined()
    expect(call[0].prompt).toContain('cancer')
  })

  it('streams the fit paragraph into state.fit.text', () => {
    const withFields = { ...props, extractedFields: { condition: 'cancer', age: 50, sex: 'FEMALE' } }
    const { result } = renderHook(() => useSimplifier(withFields))
    act(() => result.current.enqueueAssessFit(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: 'This trial may fit you.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    const state = result.current.states.get('NCT001')
    expect(state.fit.text).toBe('This trial may fit you.')
    expect(state.fit.status).toBe('complete')
  })
})

describe('useSimplifier — queue ordering', () => {
  it('processes tasks one at a time in FIFO order', () => {
    const trial2 = { ...trial, nctId: 'NCT002' }
    const { result } = renderHook(() => useSimplifier(props))
    act(() => {
      result.current.enqueueSummarize(trial)
      result.current.enqueueSummarize(trial2)
    })
    const summarizeCalls = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCalls).toHaveLength(1)
    expect(summarizeCalls[0][0].prompt).toContain('A Phase 3 study of drug X.')
    const firstTaskId = summarizeCalls[0][0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId: firstTaskId } }))
    const summarizeCallsAfter = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCallsAfter).toHaveLength(2)
  })
})

describe('useSimplifier — cancelPending and resetCache', () => {
  it('cancelPending drops queued tasks but lets the in-flight one finish', () => {
    const trial2 = { ...trial, nctId: 'NCT002' }
    const { result } = renderHook(() => useSimplifier(props))
    act(() => {
      result.current.enqueueSummarize(trial)
      result.current.enqueueSummarize(trial2)
    })
    act(() => result.current.cancelPending())
    const firstTaskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId: firstTaskId } }))
    const summarizeCallsAfter = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCallsAfter).toHaveLength(1)
  })

  it('resetCache empties the states map', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    expect(result.current.states.size).toBe(1)
    act(() => result.current.resetCache())
    expect(result.current.states.size).toBe(0)
  })

  it('discards chunks for taskIds that no longer correspond to any cached state', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => result.current.resetCache())
    expect(() => {
      act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: 'late' } }))
      act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    }).not.toThrow()
    expect(result.current.states.size).toBe(0)
  })
})
