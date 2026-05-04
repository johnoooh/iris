// Module-singleton accessor for the single nlp.worker.js instance shared
// between useNLP (loads the model + runs Phase 2 extraction) and
// useSimplifier (runs Phase 3 summarize/assess_fit on the same loaded
// model). Each hook attaches its own message handler via attachListener
// so worker.onmessage isn't monopolized.

let workerInstance = null
const listeners = new Set()

export function getSharedWorker() {
  if (workerInstance) return workerInstance
  workerInstance = new Worker(new URL('./nlp.worker.js', import.meta.url), { type: 'module' })
  workerInstance.onmessage = (event) => {
    for (const fn of listeners) fn(event)
  }
  workerInstance.onerror = (event) => {
    for (const fn of listeners) fn({ data: { type: 'error', message: event?.message ?? 'worker error' } })
  }
  return workerInstance
}

export function attachListener(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function terminateSharedWorker() {
  if (!workerInstance) return
  workerInstance.terminate()
  workerInstance = null
  listeners.clear()
}
