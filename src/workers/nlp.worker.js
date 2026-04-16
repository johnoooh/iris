// src/workers/nlp.worker.js
// Dynamically imported so @mlc-ai/web-llm stays out of the main bundle.
let engine = null

self.onmessage = async (event) => {
  const { type, text } = event.data

  if (type === 'load') {
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      // Model ID verified against installed web-llm: gemma-2-2b-it-q4f32_1-MLC
      engine = await CreateMLCEngine('gemma-2-2b-it-q4f32_1-MLC', {
        initProgressCallback: (progress) => {
          self.postMessage({ type: 'progress', progress })
        },
      })
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
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
      const raw = reply.choices[0].message.content
      self.postMessage({ type: 'result', raw })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message })
    }
  }
}
