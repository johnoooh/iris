import { describe, it, expect } from 'vitest'
import { buildCacheKey, parseSummarizeStream } from './simplifyHelpers'

describe('buildCacheKey', () => {
  it('joins nctId, promptType, and modelKey with colons', () => {
    expect(buildCacheKey('NCT12345', 'summarize', 'gemma')).toBe('NCT12345:summarize:gemma')
  })

  it('treats different models as separate cache entries', () => {
    expect(buildCacheKey('NCT1', 'summarize', 'gemma'))
      .not.toBe(buildCacheKey('NCT1', 'summarize', 'qwen3'))
  })

  it('treats different prompt types as separate cache entries', () => {
    expect(buildCacheKey('NCT1', 'summarize', 'gemma'))
      .not.toBe(buildCacheKey('NCT1', 'assess_fit', 'gemma'))
  })
})

describe('parseSummarizeStream', () => {
  it('returns summary only when delimiter has not yet streamed', () => {
    const buffer = '## What this study is testing\nThe study tests a new drug.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('The study tests a new drug.')
    expect(result.eligibility).toBeNull()
    expect(result.complete).toBe(false)
  })

  it('splits summary and eligibility once the delimiter has streamed', () => {
    const buffer =
      '## What this study is testing\nThe study tests a new drug.\n\n## Who can join\nAdults 18+.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('The study tests a new drug.')
    expect(result.eligibility).toBe('Adults 18+.')
    expect(result.complete).toBe(true)
  })

  it('handles a partial delimiter line gracefully (still streaming the header)', () => {
    const buffer = '## What this study is testing\nFoo bar.\n\n## Who can'
    const result = parseSummarizeStream(buffer)
    // No complete delimiter yet — still all summary
    expect(result.complete).toBe(false)
    expect(result.eligibility).toBeNull()
  })

  it('strips the leading "## What this study is testing" header from summary', () => {
    const buffer = '## What this study is testing\n\nA paragraph.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('A paragraph.')
  })

  it('tolerates a missing leading header (small-model output that skips it)', () => {
    const buffer = 'A paragraph with no header.\n\n## Who can join\nEligibility text.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('A paragraph with no header.')
    expect(result.eligibility).toBe('Eligibility text.')
  })

  it('trims surrounding whitespace from both sections', () => {
    const buffer = '## What this study is testing\n\n   Summary text.   \n\n## Who can join\n\n   Elig text.   '
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('Summary text.')
    expect(result.eligibility).toBe('Elig text.')
  })

  it('returns empty string (not null) for summary when buffer is just the header', () => {
    const buffer = '## What this study is testing\n'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('')
    expect(result.eligibility).toBeNull()
    expect(result.complete).toBe(false)
  })
})
