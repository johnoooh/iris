// src/workers/nlp.worker.js
// Dynamically imported so @mlc-ai/web-llm stays out of the main bundle.

// Message protocol:
//   IN  { type: 'load', modelId, isThinking }  — initializes MLCEngine
//   IN  { type: 'extract', text }              — Phase 2 extraction (one-shot)
//   IN  { type: 'summarize',  taskId, prompt } — Phase 3 summarize, streaming
//   IN  { type: 'assess_fit', taskId, prompt } — Phase 3 fit, streaming
//   IN  { type: 'unload', modelId }            — release GPU memory + delete cached weights
//   OUT { type: 'progress', progress }         — load progress
//   OUT { type: 'ready' }                      — engine initialized
//   OUT { type: 'result', raw }                — Phase 2 extract output
//   OUT { type: 'chunk',     taskId, text }    — streaming token batch
//   OUT { type: 'task_done', taskId }          — stream finished cleanly
//   OUT { type: 'task_error', taskId, message }— stream errored
//   OUT { type: 'unloaded' }                   — engine torn down + cache cleared
//   OUT { type: 'error', message }             — load or extract error
let engine = null
let loading = false
let isThinkingModel = false

const DEFAULT_MODEL_ID = 'gemma-2-2b-it-q4f32_1-MLC'

self.onmessage = async (event) => {
  const { type, text, modelId, isThinking, chatOpts, taskId, prompt } = event.data

  if (type === 'load') {
    if (engine) { self.postMessage({ type: 'ready' }); return }
    if (loading) return
    loading = true
    isThinkingModel = Boolean(isThinking)
    try {
      const { CreateMLCEngine /* , prebuiltAppConfig */ } = await import('@mlc-ai/web-llm')
      // CreateMLCEngine signature: (modelId, engineConfig, chatOpts).
      // chatOpts is per-model config override (e.g. sliding_window_size:-1
      // for gemma3, whose prebuilt record sets context_window_size:4096
      // alongside sliding_window_size:512 — the engine rejects both being
      // positive).
      //
      // ─── Custom model wiring (stub) ──────────────────────────────────
      // To serve a fine-tuned model (e.g. a domain-specific LoRA merged
      // back into Qwen2.5-1.5B), uncomment the appConfig block below and
      // add a matching entry to nlpModels.js with model_id matching the
      // one here. The model and model_lib URLs must be CORS-accessible —
      // HuggingFace Hub serves MLC artifacts with the right headers; a
      // self-hosted bucket needs explicit CORS config. See
      // ~/Documents/Github/sevry_vault/Work/ClaudeCode/iris/lora-training-process.md
      // for the end-to-end LoRA → MLC → WebLLM pipeline.
      //
      // const appConfig = {
      //   model_list: [
      //     ...prebuiltAppConfig.model_list,
      //     {
      //       model: 'https://huggingface.co/USER/iris-classifier-q4f16_1-MLC/resolve/main/',
      //       model_id: 'iris-classifier-q4f16_1-MLC',
      //       model_lib: 'https://huggingface.co/USER/iris-classifier-q4f16_1-MLC/resolve/main/iris-classifier-q4f16_1-ctx4k_cs1k-webgpu.wasm',
      //     },
      //   ],
      // }
      engine = await CreateMLCEngine(
        modelId ?? DEFAULT_MODEL_ID,
        {
          initProgressCallback: (progress) => {
            self.postMessage({ type: 'progress', progress })
          },
          // appConfig, // ← uncomment alongside the block above
        },
        chatOpts ?? undefined,
      )
      loading = false
      self.postMessage({ type: 'ready' })
    } catch (err) {
      loading = false
      self.postMessage({ type: 'error', message: err?.message ?? String(err) })
    }
    return
  }

  if (type === 'extract') {
    if (!engine) {
      self.postMessage({ type: 'error', message: 'Engine not loaded' })
      return
    }
    try {
      // Same rationale as the summarize path — clear KV cache between calls
      // so latency stays flat across many extractions in a row.
      if (typeof engine.resetChat === 'function') {
        try { await engine.resetChat() } catch { /* best effort */ }
      }
      const request = {
        messages: [{ role: 'user', content: text }],
        // 400 tokens is enough headroom for the schema plus any preamble
        // the smaller multilingual models occasionally emit before the
        // JSON object. The schema is small so this is still cheap.
        max_tokens: 400,
        temperature: 0.1,
      }
      if (isThinkingModel) request.extra_body = { enable_thinking: false }
      const reply = await engine.chat.completions.create(request)
      const raw = reply.choices?.[0]?.message?.content
      if (!raw) {
        self.postMessage({ type: 'error', message: 'Model returned empty response' })
        return
      }
      self.postMessage({ type: 'result', raw })
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message ?? String(err) })
    }
    return
  }

  if (type === 'unload') {
    try {
      const idToDelete = modelId ?? DEFAULT_MODEL_ID
      // Release the engine first so its WebGPU buffers are freed before we
      // delete the on-disk cache. Best-effort; older WebLLM versions may
      // not expose unload().
      if (engine && typeof engine.unload === 'function') {
        try { await engine.unload() } catch { /* best effort */ }
      }
      engine = null
      loading = false
      isThinkingModel = false
      const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm')
      await deleteModelAllInfoInCache(idToDelete)
      self.postMessage({ type: 'unloaded' })
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message ?? String(err) })
    }
    return
  }

  if (type === 'translate') {
    if (!engine) {
      self.postMessage({ type: 'translate_error', taskId, message: 'Engine not loaded' })
      return
    }
    try {
      const t0 = Date.now()
      if (typeof engine.resetChat === 'function') {
        try { await engine.resetChat() } catch { /* best effort */ }
      }
      // Translation typically needs more headroom than classification (one
      // verdict word + reason fits in 80; a paraphrased clinical sentence
      // can run 100-200 tokens for verbose languages). Same low temperature
      // since we want fidelity, not creativity.
      const request = {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
      }
      if (isThinkingModel) request.extra_body = { enable_thinking: false }
      const reply = await engine.chat.completions.create(request)
      const raw = reply.choices?.[0]?.message?.content ?? ''
      self.postMessage({ type: 'translate_done', taskId, raw, latencyMs: Date.now() - t0 })
    } catch (err) {
      self.postMessage({ type: 'translate_error', taskId, message: err?.message ?? String(err) })
    }
    return
  }

  if (type === 'classify') {
    if (!engine) {
      self.postMessage({ type: 'classify_error', taskId, message: 'Engine not loaded' })
      return
    }
    try {
      const t0 = Date.now()
      // Reset KV cache between classifications so they're independent.
      if (typeof engine.resetChat === 'function') {
        try { await engine.resetChat() } catch { /* best effort */ }
      }
      const request = {
        messages: [{ role: 'user', content: prompt }],
        // Stage-1 verdict + one-sentence reason fits comfortably in ~60 tokens.
        // Generous headroom (80) covers preamble drift from the smaller models.
        max_tokens: 80,
        temperature: 0.1,
      }
      if (isThinkingModel) request.extra_body = { enable_thinking: false }
      const reply = await engine.chat.completions.create(request)
      const raw = reply.choices?.[0]?.message?.content ?? ''
      self.postMessage({ type: 'classify_done', taskId, raw, latencyMs: Date.now() - t0 })
    } catch (err) {
      self.postMessage({ type: 'classify_error', taskId, message: err?.message ?? String(err) })
    }
    return
  }

  if (type === 'summarize' || type === 'assess_fit') {
    if (!engine) {
      self.postMessage({ type: 'task_error', taskId, message: 'Engine not loaded' })
      return
    }
    try {
      // Reset the chat KV cache between tasks. WebLLM's MLCEngine retains
      // conversation state across calls by default — running 20 summarize
      // tasks in sequence accumulates ~20× the prompt tokens in working
      // memory, which causes monotonic latency growth and eventually OOM.
      // Each task here is independent (one-shot, no follow-up turns), so
      // resetting before each call gives every task the same fresh context.
      if (typeof engine.resetChat === 'function') {
        try { await engine.resetChat() } catch { /* best effort */ }
      }
      const request = {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: type === 'summarize' ? 500 : 250,
        // Summarize uses a tiny temperature (0.1) rather than 0 to escape
        // greedy-decoding repetition traps — at temperature 0 we observed a
        // run where the model emitted the same sentence 35+ times until
        // max_tokens. frequency_penalty further discourages echoing the
        // same n-grams. Assess-fit keeps a slightly higher temperature so
        // its hedging language ("may", "might") doesn't collapse into a
        // single deterministic phrase across trials.
        temperature: type === 'summarize' ? 0.1 : 0.2,
        // Bumped from 0.3 → 0.6 because Gemma 2 2B was hitting degenerate
        // loops on the simplify prompt — emitting strings of "##" header
        // markers ("############# ## ## ## …") instead of the body content.
        // Higher frequency penalty discourages the same n-gram from
        // re-firing, breaking the loop. Assess-fit stays at 0 so its
        // hedging language ("may", "might") doesn't get penalized.
        frequency_penalty: type === 'summarize' ? 0.6 : 0,
        stream: true,
      }
      if (isThinkingModel) request.extra_body = { enable_thinking: false }
      const stream = await engine.chat.completions.create(request)
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) self.postMessage({ type: 'chunk', taskId, text: delta })
      }
      self.postMessage({ type: 'task_done', taskId })
    } catch (err) {
      self.postMessage({
        type: 'task_error',
        taskId,
        message: err?.message ?? String(err),
      })
    }
    return
  }
}
