// Model registry for the NLP feature. IDs are verified against the installed
// @mlc-ai/web-llm prebuilt model list. Switching is exposed in the UI via a
// `?model=<key>` query param so we can A/B compare without redeploying.

export const NLP_MODELS = {
  gemma: {
    id: 'gemma-2-2b-it-q4f32_1-MLC',
    label: 'Gemma 2 2B',
    sizeLabel: '~1.3 GB',
    isThinking: false,
  },
  qwen3: {
    id: 'Qwen3-1.7B-q4f32_1-MLC',
    label: 'Qwen3 1.7B',
    sizeLabel: '~1.1 GB',
    // Qwen3 is a reasoning model — without enable_thinking:false it emits a
    // <think>…</think> block before the answer, which breaks JSON parsing.
    isThinking: true,
  },
}

export const DEFAULT_MODEL_KEY = 'gemma'

export function resolveModelKey(search) {
  // search is typically window.location.search
  const params = new URLSearchParams(search ?? '')
  const requested = params.get('model')
  return NLP_MODELS[requested] ? requested : DEFAULT_MODEL_KEY
}
