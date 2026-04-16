// src/workers/nlp.worker.js
// Dynamically imported so @mlc-ai/web-llm stays out of the main bundle.

// Message protocol:
//   IN  { type: 'load' }               — initializes MLCEngine; emits progress/ready/error
//   IN  { type: 'extract', text }      — text is a pre-built prompt string (see nlpHelpers.buildPrompt)
//   OUT { type: 'progress', progress } — forwarded from initProgressCallback
//   OUT { type: 'ready' }              — engine is initialized
//   OUT { type: 'result', raw }        — raw LLM output string; caller calls parseExtraction on it
//   OUT { type: 'error', message }     — any load or extraction failure
let engine = null
let loading = false

self.onmessage = async (event) => {
  const { type, text } = event.data

  if (type === 'load') {
    if (engine) { self.postMessage({ type: 'ready' }); return }
    if (loading) return
    loading = true
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      // Model ID verified against installed web-llm: gemma-2-2b-it-q4f32_1-MLC
      engine = await CreateMLCEngine('gemma-2-2b-it-q4f32_1-MLC', {
        initProgressCallback: (progress) => {
          self.postMessage({ type: 'progress', progress })
        },
      })
      loading = false
      self.postMessage({ type: 'ready' })
    } catch (err) {
      loading = false
      self.postMessage({ type: 'error', message: err?.message ?? String(err) })
    }
  }

  if (type === 'extract') {
    if (!engine) {
      self.postMessage({ type: 'error', message: 'Engine not loaded' })
      return
    }
    try {
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'user', content: text }],
        max_tokens: 200,
        temperature: 0.1,
      })
      const raw = reply.choices?.[0]?.message?.content
      if (!raw) {
        self.postMessage({ type: 'error', message: 'Model returned empty response' })
        return
      }
      self.postMessage({ type: 'result', raw })
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message ?? String(err) })
    }
  }
}
