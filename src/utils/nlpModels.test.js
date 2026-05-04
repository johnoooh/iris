import { describe, it, expect } from 'vitest'
import { NLP_MODELS, DEFAULT_MODEL_KEY, resolveModelKey } from './nlpModels'

describe('NLP_MODELS registry', () => {
  it('has gemma and qwen3 entries with id, label, sizeLabel', () => {
    for (const key of ['gemma', 'qwen3']) {
      expect(NLP_MODELS[key]).toBeDefined()
      expect(typeof NLP_MODELS[key].id).toBe('string')
      expect(typeof NLP_MODELS[key].label).toBe('string')
      expect(typeof NLP_MODELS[key].sizeLabel).toBe('string')
    }
  })

  it('default key resolves to a registered model', () => {
    expect(NLP_MODELS[DEFAULT_MODEL_KEY]).toBeDefined()
  })
})

describe('resolveModelKey', () => {
  it('returns the default when no model param is present', () => {
    expect(resolveModelKey('')).toBe(DEFAULT_MODEL_KEY)
    expect(resolveModelKey('?foo=bar')).toBe(DEFAULT_MODEL_KEY)
  })

  it('returns the matching key when ?model=qwen3 is set', () => {
    expect(resolveModelKey('?model=qwen3')).toBe('qwen3')
  })

  it('returns the matching key when ?model=gemma is set', () => {
    expect(resolveModelKey('?model=gemma')).toBe('gemma')
  })

  it('falls back to the default for unknown model values', () => {
    expect(resolveModelKey('?model=llama-99b')).toBe(DEFAULT_MODEL_KEY)
  })

  it('handles missing/null search input', () => {
    expect(resolveModelKey(null)).toBe(DEFAULT_MODEL_KEY)
    expect(resolveModelKey(undefined)).toBe(DEFAULT_MODEL_KEY)
  })
})
