// Lightweight script-based language detection. Used only to decide whether
// the local LLM can produce a usable plain-language summary for the patient.
// Returns one of: 'en' | 'es' | 'zh' | 'ar' | 'other'.
//
// Why script heuristics and not a model: detection runs on every keystroke
// of the natural-language input and on every search submission. A real
// classifier would inflate the bundle, and our routing decision is binary
// (supported vs not), so high-precision script detection is sufficient.
//
// 'zh' covers CJK ideographs plus Japanese kana — they share the same
// "use browser translate" hint UX and our model can't generate either.

const HAN_KANA_RE = /[一-鿿぀-ゟ゠-ヿ]/
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/
// Cyrillic, Hangul, Devanagari, Thai, Hebrew — supported only in the sense
// that we know we can't help.
const OTHER_NON_LATIN_RE = /[Ѐ-ӿ가-힯ऀ-ॿ฀-๿֐-׿]/

// Spanish-specific markers: characters that are uncommon in English plus
// short, distinctive Spanish words. Word list is intentionally small —
// false positives push to Spanish output, which Gemma 2 2B handles fine,
// so the cost of a wrong call is low.
const SPANISH_RE =
  /[ñÑ¿¡áéíóúüÁÉÍÓÚÜ]|\b(tengo|años|hola|gracias|enfermedad|cáncer|quiero|busco|soy|estoy|edad|hombre|mujer)\b/i

export function detectInputLanguage(text) {
  if (!text || !text.trim()) return 'en'
  if (HAN_KANA_RE.test(text)) return 'zh'
  if (ARABIC_RE.test(text)) return 'ar'
  if (OTHER_NON_LATIN_RE.test(text)) return 'other'
  if (SPANISH_RE.test(text)) return 'es'
  return 'en'
}

// Languages where the local model can produce a usable simplification.
// Adding a language here requires that the model also be tested at that
// language — see NLPTestPanel.
export const SUPPORTED_SIMPLIFICATION_LANGUAGES = new Set(['en', 'es'])

// Maps the detector's two-letter code to the natural-language string we
// pass into buildSummarizePrompt's `outputLanguage`. English is the default
// behavior in the prompt builder — we still emit it here so callers can
// pass through a single value uniformly.
const OUTPUT_LANGUAGE_BY_CODE = {
  en: 'English',
  es: 'Spanish',
}

export function outputLanguageFor(code) {
  return OUTPUT_LANGUAGE_BY_CODE[code] ?? 'English'
}

// Hint shown when the input is in a language the local model can't
// reliably simplify. The Chinese and Arabic versions duplicate the
// English text in the user's likely script so the call-to-action is
// recognizable before the user invokes their browser's translate.
export const UNSUPPORTED_LANGUAGE_HINTS = {
  zh: '请使用浏览器的翻译功能查看此试验。Use your browser\'s translate feature to read this trial.',
  ar: 'استخدم ميزة الترجمة في متصفحك لقراءة هذه التجربة. Use your browser\'s translate feature to read this trial.',
  other: 'Use your browser\'s translate feature to read this trial in your language.',
}
