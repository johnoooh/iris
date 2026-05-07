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
  // Gemma 2 2B q4f16_1 was tried as a faster alternative (~30% lower
  // latency from native-fp16 WebGPU compute) but the lower activation
  // precision degraded the simplifier's structured output — section
  // headers ("## What this study is testing" / "## Who can join") came
  // out malformed, and Gemma can only have ONE quant loaded at a time
  // so we can't mix q4f16_1 for classification and q4f32_1 for
  // simplification. q4f32_1 stays as the sole Gemma 2 2B variant.

  qwen3: {
    id: 'Qwen3-1.7B-q4f32_1-MLC',
    label: 'Qwen3 1.7B',
    sizeLabel: '~1.1 GB',
    // Qwen3 is a reasoning model — without enable_thinking:false it emits a
    // <think>…</think> block before the answer, which breaks JSON parsing.
    isThinking: true,
  },
  llama32: {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B',
    // q4f16_1 instead of q4f32_1: smaller (~1.9 GB vs ~2.4 GB) and faster on
    // most GPUs with effectively no quality difference for instruction tasks.
    sizeLabel: '~1.9 GB',
    isThinking: false,
  },
  qwen25: {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    sizeLabel: '~900 MB',
    isThinking: false,
  },
}

export const DEFAULT_MODEL_KEY = 'gemma'

export function resolveModelKey(search) {
  // search is typically window.location.search
  const params = new URLSearchParams(search ?? '')
  const requested = params.get('model')
  return NLP_MODELS[requested] ? requested : DEFAULT_MODEL_KEY
}
