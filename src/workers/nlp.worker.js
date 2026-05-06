// src/workers/nlp.worker.js
// Dynamically imported so @mlc-ai/web-llm stays out of the main bundle.

// Message protocol:
//   IN  { type: 'load', modelId, isThinking } — initializes MLCEngine
//   IN  { type: 'extract', text }              — Phase 2 extraction (one-shot)
//   IN  { type: 'summarize',  taskId, prompt } — Phase 3 summarize, streaming
//   IN  { type: 'assess_fit', taskId, prompt } — Phase 3 fit, streaming
//   OUT { type: 'progress', progress }         — load progress
//   OUT { type: 'ready' }                      — engine initialized
//   OUT { type: 'result', raw }                — Phase 2 extract output
//   OUT { type: 'chunk',     taskId, text }    — streaming token batch
//   OUT { type: 'task_done', taskId }          — stream finished cleanly
//   OUT { type: 'task_error', taskId, message }— stream errored
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
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      // CreateMLCEngine signature: (modelId, engineConfig, chatOpts).
      // chatOpts is per-model config override (e.g. sliding_window_size:-1
      // for gemma3, whose prebuilt record sets context_window_size:4096
      // alongside sliding_window_size:512 — the engine rejects both being
      // positive).
      engine = await CreateMLCEngine(
        modelId ?? DEFAULT_MODEL_ID,
        {
          initProgressCallback: (progress) => {
            self.postMessage({ type: 'progress', progress })
          },
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
        // Summarize uses temperature 0 (greedy) because faithfulness to the
        // source matters more than fluency variation — fabrications drop
        // significantly at low temperatures. Assess-fit keeps a small
        // temperature so its hedging language ("may", "might") doesn't
        // collapse into a single deterministic phrase across trials.
        temperature: type === 'summarize' ? 0 : 0.2,
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
