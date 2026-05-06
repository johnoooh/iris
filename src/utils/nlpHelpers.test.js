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

  it('instructs the model not to infer sex from the condition', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toMatch(/breast cancer.*do not imply|do not imply.*breast cancer/i)
  })

  it('instructs the model not to infer sex from grammatical gender', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toMatch(/grammatical gender/i)
  })

  it('instructs the model to translate non-English input to English', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toMatch(/ENGLISH/i)
    expect(prompt).toContain('cáncer de mama')
  })

  it('instructs the model to translate multi-word condition phrases (adjective + noun)', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toContain('melanoma metastásico')
    expect(prompt).toContain('metastatic melanoma')
  })

  it('instructs the model to replace vague "problems" with formal "disease"/"disorder"', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toMatch(/kidney problems.*kidney disease/i)
    expect(prompt).toMatch(/problemas/i)
  })

  it('instructs the model to translate Spanish place names to their English form', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toContain('Filadelfia')
    expect(prompt).toContain('Philadelphia')
  })
})

describe('parseExtraction', () => {
  it('parses a complete valid JSON response', () => {
    const raw = '{"condition":"breast cancer","location":"Brooklyn","age":52,"sex":"FEMALE","phases":["PHASE2"]}'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('breast cancer')
    expect(result.location).toBe('Brooklyn')
    expect(result.age).toBe(52)
    expect(result.sex).toBe('FEMALE')
    expect(result.phases).toEqual(['PHASE2'])
  })

  it('does not include status — recruitment status is not extracted from free text', () => {
    const result = parseExtraction('{"condition":"cancer","status":"NOT_YET_RECRUITING"}')
    expect(result.status).toBeUndefined()
  })

  it('strips <think>…</think> blocks before parsing JSON (reasoning models)', () => {
    const raw = '<think>The patient said breast cancer. I should output {a:1} as a thought.</think>\n{"condition":"breast cancer","age":52}'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('breast cancer')
    expect(result.age).toBe(52)
  })

  it('strips an unclosed trailing <think> block', () => {
    const raw = '{"condition":"lung cancer"}\n<think>still reasoning…'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('lung cancer')
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

  it('does not set a status default — status is left to the form', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.status).toBeUndefined()
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
