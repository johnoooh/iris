import { describe, it, expect } from 'vitest'
import {
  detectInputLanguage,
  outputLanguageFor,
  SUPPORTED_SIMPLIFICATION_LANGUAGES,
  UNSUPPORTED_LANGUAGE_HINTS,
} from './detectInputLanguage'

describe('detectInputLanguage', () => {
  it('returns "en" for empty / whitespace input', () => {
    expect(detectInputLanguage('')).toBe('en')
    expect(detectInputLanguage('   ')).toBe('en')
    expect(detectInputLanguage(null)).toBe('en')
    expect(detectInputLanguage(undefined)).toBe('en')
  })

  it('returns "en" for plain English prose', () => {
    expect(detectInputLanguage("I'm 58 years old with breast cancer in Boston")).toBe('en')
    expect(detectInputLanguage('looking for diabetes trials')).toBe('en')
  })

  it('returns "es" when Spanish-only characters are present', () => {
    expect(detectInputLanguage('Tengo cáncer de mama')).toBe('es')
    expect(detectInputLanguage('Hola, busco un ensayo clínico')).toBe('es')
  })

  it('returns "es" when Spanish marker words are present even without diacritics', () => {
    expect(detectInputLanguage('busco trials para mi enfermedad')).toBe('es')
    expect(detectInputLanguage('tengo 60 anos')).toBe('es')
  })

  it('returns "zh" for Han ideographs', () => {
    expect(detectInputLanguage('我58岁,在波士顿患有乳腺癌')).toBe('zh')
  })

  it('returns "zh" for Japanese kana (same hint UX as Chinese)', () => {
    expect(detectInputLanguage('わたしはがんです')).toBe('zh')
  })

  it('returns "ar" for Arabic script', () => {
    expect(detectInputLanguage('عمري 58 عامًا ولدي سرطان الثدي في بوسطن')).toBe('ar')
  })

  it('returns "other" for Cyrillic / Hangul / Devanagari / Thai / Hebrew', () => {
    expect(detectInputLanguage('У меня рак груди')).toBe('other')
    expect(detectInputLanguage('저는 유방암이 있어요')).toBe('other')
    expect(detectInputLanguage('मुझे स्तन कैंसर है')).toBe('other')
    expect(detectInputLanguage('ฉันเป็นมะเร็งเต้านม')).toBe('other')
    expect(detectInputLanguage('יש לי סרטן השד')).toBe('other')
  })
})

describe('SUPPORTED_SIMPLIFICATION_LANGUAGES', () => {
  it('includes English and Spanish only', () => {
    expect(SUPPORTED_SIMPLIFICATION_LANGUAGES.has('en')).toBe(true)
    expect(SUPPORTED_SIMPLIFICATION_LANGUAGES.has('es')).toBe(true)
    expect(SUPPORTED_SIMPLIFICATION_LANGUAGES.has('zh')).toBe(false)
    expect(SUPPORTED_SIMPLIFICATION_LANGUAGES.has('ar')).toBe(false)
    expect(SUPPORTED_SIMPLIFICATION_LANGUAGES.has('other')).toBe(false)
  })
})

describe('outputLanguageFor', () => {
  it('maps en/es to the natural-language strings used by the prompt builder', () => {
    expect(outputLanguageFor('en')).toBe('English')
    expect(outputLanguageFor('es')).toBe('Spanish')
  })

  it('falls back to English for unknown / unsupported codes', () => {
    expect(outputLanguageFor('zh')).toBe('English')
    expect(outputLanguageFor('xx')).toBe('English')
  })
})

describe('UNSUPPORTED_LANGUAGE_HINTS', () => {
  it('has hints for zh, ar, and other', () => {
    expect(UNSUPPORTED_LANGUAGE_HINTS.zh).toMatch(/translate/i)
    expect(UNSUPPORTED_LANGUAGE_HINTS.ar).toMatch(/translate/i)
    expect(UNSUPPORTED_LANGUAGE_HINTS.other).toMatch(/translate/i)
  })
})
