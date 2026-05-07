import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useClassifier } from './useClassifier'

// Mock the shared worker so tests don't touch the real WebLLM worker.
// We intercept postMessage to capture call order, and we expose a way for
// the test to invoke the listener with synthetic 'classify_done' messages.
let capturedListener = null
let postedMessages = []

vi.mock('../workers/sharedNlpWorker', () => ({
  getSharedWorker: () => ({
    postMessage: (msg) => { postedMessages.push(msg) },
  }),
  attachListener: (fn) => {
    capturedListener = fn
    return () => { capturedListener = null }
  },
}))

beforeEach(() => {
  capturedListener = null
  postedMessages = []
})

// Helper: construct a 'classify_done' worker message and pass it to whatever
// useClassifier registered as its listener.
function dispatchDone(taskId, raw = 'LIKELY | mock', latencyMs = 100) {
  capturedListener({ data: { type: 'classify_done', taskId, raw, latencyMs } })
}

describe('useClassifier — promise chain serialization', () => {
  it('posts only the first request to the worker until it settles', async () => {
    const { result } = renderHook(() => useClassifier())

    // Fire 3 concurrent classifyOne calls.
    let p1, p2, p3
    p1 = result.current.classifyOne('prompt-1')
    p2 = result.current.classifyOne('prompt-2')
    p3 = result.current.classifyOne('prompt-3')

    // Only the first task should be in flight.
    await waitFor(() => expect(postedMessages.length).toBe(1))
    expect(postedMessages[0].prompt).toBe('prompt-1')

    // Settle task 1; task 2 should now post.
    dispatchDone(postedMessages[0].taskId, 'LIKELY | one')
    await p1
    await waitFor(() => expect(postedMessages.length).toBe(2))
    expect(postedMessages[1].prompt).toBe('prompt-2')

    // Settle task 2; task 3 posts.
    dispatchDone(postedMessages[1].taskId, 'UNLIKELY | two')
    await p2
    await waitFor(() => expect(postedMessages.length).toBe(3))
    expect(postedMessages[2].prompt).toBe('prompt-3')

    // Settle task 3.
    dispatchDone(postedMessages[2].taskId, 'LIKELY | three')
    const r3 = await p3
    expect(r3.raw).toBe('LIKELY | three')
  })

  it('does not poison the queue when one task rejects', async () => {
    const { result } = renderHook(() => useClassifier())

    const p1 = result.current.classifyOne('prompt-A')
    const p2 = result.current.classifyOne('prompt-B')

    await waitFor(() => expect(postedMessages.length).toBe(1))

    // Reject task 1 via classify_error.
    capturedListener({ data: { type: 'classify_error', taskId: postedMessages[0].taskId, message: 'boom' } })
    await expect(p1).rejects.toThrow('boom')

    // Task 2 should still post and resolve.
    await waitFor(() => expect(postedMessages.length).toBe(2))
    dispatchDone(postedMessages[1].taskId, 'LIKELY | recovered')
    const r2 = await p2
    expect(r2.raw).toBe('LIKELY | recovered')
  })

  it('rejects pending tasks when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useClassifier())

    const p1 = result.current.classifyOne('prompt-pending')
    await waitFor(() => expect(postedMessages.length).toBe(1))

    // Mid-flight: unmount.
    act(() => unmount())

    await expect(p1).rejects.toThrow(/unmounted/)
  })
})
