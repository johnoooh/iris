import { describe, it, expect } from 'vitest'
import { buildCacheKey, parseSummarizeStream } from './simplifyHelpers'
import { buildSummarizePrompt, buildAssessFitPrompt } from './simplifyHelpers'

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

  it('strips empty <think></think> blocks emitted by reasoning models', () => {
    const buffer = '<think></think>\n\n## What this study is testing\nThe study tests a new drug.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('The study tests a new drug.')
  })

  it('strips populated <think>…</think> blocks before the delimiter', () => {
    const buffer =
      '<think>let me reason through this</think>\n## What this study is testing\nFoo.\n\n## Who can join\nBar.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('Foo.')
    expect(result.eligibility).toBe('Bar.')
    expect(result.complete).toBe(true)
  })

  it('hides an unterminated <think> block while it is still streaming', () => {
    const buffer = '<think>I should think about'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('')
    expect(result.complete).toBe(false)
  })
})

describe('buildSummarizePrompt', () => {
  const trial = {
    summary: 'A Phase 3 study of drug X in patients with condition Y.',
    eligibility: { criteria: 'Inclusion: adults 18+. Exclusion: pregnancy.' },
  }

  it('includes the trial briefSummary verbatim', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('A Phase 3 study of drug X in patients with condition Y.')
  })

  it('includes the eligibility criteria verbatim', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('Inclusion: adults 18+. Exclusion: pregnancy.')
  })

  it('includes the AHRQ exemplar so the model has a one-shot anchor', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('## What this study is testing')
    expect(prompt).toContain('## Who can join')
    expect(prompt).toContain('pembrolizumab') // from the exemplar
  })

  it('instructs the model on AHRQ-style writing', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/8th-grade|plain language|short sentences/i)
  })

  it('forbids padding with examples not present in the source', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/lung, stomach, or colon|examples that are not in the source/i)
  })

  it('forbids inventing disease stage / progression / age limits', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/early breast cancer.*spread|stage|progression/i)
    expect(prompt).toMatch(/age range|do not invent/i)
  })

  it('warns against single-disease tunnel vision on multi-disease trials', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/multiple conditions|multi-disease|do not pick one/i)
  })

  it('clarifies metastatic vs CNS terminology to prevent paraphrase drift', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/metastatic.*spread|CNS metastases/i)
  })

  it('omits a LANGUAGE instruction by default (English implied)', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).not.toMatch(/LANGUAGE REQUIREMENT/)
  })

  it('omits a LANGUAGE instruction when outputLanguage is English', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'English' })
    expect(prompt).not.toMatch(/LANGUAGE REQUIREMENT/)
  })

  it('emits a LANGUAGE instruction when outputLanguage is set to a non-English language', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'Spanish' })
    expect(prompt).toMatch(/YOUR OUTPUT MUST BE IN SPANISH/)
  })

  it('places the LANGUAGE directive AFTER the exemplar so it overrides the English few-shot anchor', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'Spanish' })
    const exemplarIdx = prompt.indexOf('pembrolizumab') // exemplar marker
    const langIdx = prompt.indexOf('LANGUAGE REQUIREMENT')
    expect(exemplarIdx).toBeGreaterThan(-1)
    expect(langIdx).toBeGreaterThan(exemplarIdx)
  })

  it('also includes a final pre-generation reminder so the directive is the most recent token', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'Spanish' })
    const reminderIdx = prompt.lastIndexOf('Reminder: write the body in Spanish')
    // The trailing cue used to be the bare label "PLAIN-LANGUAGE OUTPUT:" but
    // chat-tuned models read that as a header and hallucinate. The new cue is
    // a directive ending with the first header the model must emit.
    const finalCueIdx = prompt.lastIndexOf('Begin your response with "## What this study is testing"')
    expect(reminderIdx).toBeGreaterThan(-1)
    expect(reminderIdx).toBeLessThan(finalCueIdx)
  })

  it('preserves English headers even when output language is non-English', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'Arabic' })
    expect(prompt).toMatch(/headers stay in English/i)
    expect(prompt).toContain('## What this study is testing')
    expect(prompt).toContain('## Who can join')
  })

  it('instructs the model to keep drug and gene names in English', () => {
    const prompt = buildSummarizePrompt(trial, { outputLanguage: 'Mandarin Chinese' })
    expect(prompt).toMatch(/Drug names.*English form/i)
    expect(prompt).toMatch(/gene names.*English form/i)
  })
})

describe('buildAssessFitPrompt', () => {
  const trial = {
    summary: 'A Phase 3 study of drug X.',
    eligibility: { criteria: 'Adults 18+.' },
  }
  const fields = { condition: 'lung cancer', age: 60, sex: 'MALE' }

  it('includes the user description when provided', () => {
    const prompt = buildAssessFitPrompt(trial, fields, '60yo man with lung cancer in Boston')
    expect(prompt).toContain('60yo man with lung cancer in Boston')
  })

  it('includes the extracted condition / age / sex even when no description', () => {
    const prompt = buildAssessFitPrompt(trial, fields, null)
    expect(prompt).toContain('lung cancer')
    expect(prompt).toContain('60')
    expect(prompt).toContain('MALE')
  })

  it('says "(none provided)" for description when null', () => {
    const prompt = buildAssessFitPrompt(trial, fields, null)
    expect(prompt).toMatch(/none provided/i)
  })

  it('includes the trial briefSummary and eligibility', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toContain('A Phase 3 study of drug X.')
    expect(prompt).toContain('Adults 18+.')
  })

  it('includes the assess-fit exemplar', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toContain('Based on what you described') // from the exemplar
  })

  it('instructs the model to hedge and not give medical advice', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toMatch(/may|might/i)
    expect(prompt).toMatch(/not give medical advice|talk with the study doctors/i)
  })
})
