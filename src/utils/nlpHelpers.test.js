import { describe, it, expect } from 'vitest'
import { buildPrompt, parseExtraction } from './nlpHelpers'

describe('buildPrompt', () => {
  it('includes the patient text verbatim', () => {
    const prompt = buildPrompt('52yo woman with breast cancer in Brooklyn')
    expect(prompt).toContain('52yo woman with breast cancer in Brooklyn')
  })

  it('includes the JSON schema in the prompt', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toContain('"condition"')
    expect(prompt).toContain('Return ONLY valid JSON')
  })
})

describe('parseExtraction', () => {
  it('parses a complete valid JSON response', () => {
    const raw = '{"condition":"breast cancer","location":"Brooklyn","age":52,"sex":"FEMALE","status":"RECRUITING","phases":["PHASE2"]}'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('breast cancer')
    expect(result.location).toBe('Brooklyn')
    expect(result.age).toBe(52)
    expect(result.sex).toBe('FEMALE')
    expect(result.status).toBe('RECRUITING')
    expect(result.phases).toEqual(['PHASE2'])
  })

  it('strips prose before and after the JSON object', () => {
    const raw = 'Sure! Here is the data:\n{"condition":"lung cancer"}\nI hope this helps.'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('lung cancer')
  })

  it('returns condition: null when the string contains no JSON', () => {
    const result = parseExtraction('I cannot determine any fields from this.')
    expect(result.condition).toBeNull()
  })

  it('returns condition: null when JSON is malformed', () => {
    const result = parseExtraction('{condition: "cancer"')
    expect(result.condition).toBeNull()
  })

  it('returns condition: null when condition field is absent', () => {
    const result = parseExtraction('{"location":"Boston"}')
    expect(result.condition).toBeNull()
  })

  it('applies safe default sex: ALL when sex is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.sex).toBe('ALL')
  })

  it('applies safe default status: RECRUITING when status is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.status).toBe('RECRUITING')
  })

  it('applies safe default phases: [] when phases is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.phases).toEqual([])
  })

  it('filters invalid phase values from the phases array', () => {
    const raw = '{"condition":"cancer","phases":["PHASE2","INVALID","PHASE3"]}'
    const result = parseExtraction(raw)
    expect(result.phases).toEqual(['PHASE2', 'PHASE3'])
  })

  it('ignores age values outside the 1–120 range', () => {
    const result = parseExtraction('{"condition":"cancer","age":999}')
    expect(result.age).toBeUndefined()
  })

  it('ignores invalid sex values and falls back to ALL', () => {
    const result = parseExtraction('{"condition":"cancer","sex":"UNKNOWN"}')
    expect(result.sex).toBe('ALL')
  })
})
