# IRIS Phase 3 — Plain-Language Result Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-card plain-language simplification of clinical trial results using the existing in-browser WebLLM worker. Each result card shows AHRQ-style "What this study is testing" and "Who can join" sections (and a personalized "Why this might fit you" when the user provided an NLP description), with the original prose tucked into a collapsible.

**Architecture:** A new `useSimplifier` hook owns a FIFO queue and an in-memory `Map<NCTId, state>`. It speaks to the same single Web Worker that Phase 2 uses, extended with new streaming message types (`summarize`, `assess_fit`). `ResultsList` triggers an eager batch for the first 5 cards on every search change and passes per-card state down to `ResultCard`, which renders streaming sections incrementally. Cards 6+ render an on-demand button that enqueues their own simplification.

**Tech Stack:** React 18, Vite, `@mlc-ai/web-llm` (already installed), Vitest, React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/simplifyHelpers.js` | Create | Pure helpers: `buildCacheKey`, `parseSummarizeStream`, `buildSummarizePrompt`, `buildAssessFitPrompt` |
| `src/utils/simplifyHelpers.test.js` | Create | Unit tests for all four helpers — no model, no worker |
| `src/utils/simplifyExemplars.js` | Create | Hand-written AHRQ-target exemplars used as one-shot anchors in the prompts. **User reviews before downstream tasks.** |
| `src/workers/nlp.worker.js` | Modify | Add `summarize` and `assess_fit` message handlers using WebLLM's streaming chat completion API; emit `chunk`, `task_done`, `task_error` |
| `src/hooks/useSimplifier.js` | Create | Owns the cache map, the FIFO queue, the worker reference; exposes `enqueueSummarize`, `enqueueAssessFit`, `cancelPending`, `resetCache`, `states` |
| `src/hooks/useSimplifier.test.js` | Create | Tests against a mocked Worker (same `vi.stubGlobal('Worker', …)` pattern as `useNLP.test.js`) |
| `src/components/ResultCard.jsx` | Modify | Render the plain-language sections, the streaming indicator, the failure hint, the collapsible original, and the on-demand button |
| `src/components/ResultCard.test.jsx` | Modify | Add tests for each new render state (pending / streaming / complete / error / on-demand) |
| `src/components/ResultsList.jsx` | Modify | Instantiate `useSimplifier`; on `searchParams` change, reset cache + cancel pending + queue eager batch for first 5 cards; pass per-card state and request callbacks into `ResultCard` |
| `src/components/NaturalLanguageInput.jsx` | Modify | Pass the *original user description* up via the existing `onExtract` callback (now `onExtract({ fields, description })`) so `App` can pass it to `ResultsList` |
| `src/components/NaturalLanguageInput.test.jsx` | Modify | Update tests for the new `onExtract` payload shape |
| `src/App.jsx` | Modify | Lift `modelKey` resolution to `App`; store `userDescription` in state; pass `modelKey`, `userDescription`, and extracted fields to `ResultsList` |

---

## Important Context for Implementers

- **Phase 2 must keep working unchanged.** The `extract` message type stays as-is. New types coexist.
- **One worker, one model, one task at a time.** All queueing happens in the hook layer.
- **Streaming uses delimited markdown, not JSON**, so partial output renders cleanly. The `## Who can join` line is the section delimiter for the summarize prompt. The fit prompt is a single paragraph.
- **No persistent storage of any simplifications.** In-memory `Map` only — interest in a trial leaks the user's condition.
- **TDD where unit boundaries support it.** Pure helpers and the hook get unit tests. The worker is browser-only and is exercised through the mocked-Worker tests in the hook + a final manual smoke test.
- **One commit per task** with passing tests. Match the project's existing commit message style (lowercase prefix, concise).

---

## Task 1: Pure helpers — cache key + streaming parser

**Files:**
- Create: `src/utils/simplifyHelpers.js`
- Create: `src/utils/simplifyHelpers.test.js`

This task lands the two pure functions that the hook needs to do its work, with full TDD. Prompt builders come in Task 3 once the exemplars exist.

- [ ] **Step 1: Write failing tests**

Create `src/utils/simplifyHelpers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildCacheKey, parseSummarizeStream } from './simplifyHelpers'

describe('buildCacheKey', () => {
  it('joins nctId, promptType, and modelKey with colons', () => {
    expect(buildCacheKey('NCT12345', 'summarize', 'gemma')).toBe('NCT12345:summarize:gemma')
  })

  it('treats different models as separate cache entries', () => {
    expect(buildCacheKey('NCT1', 'summarize', 'gemma'))
      .not.toBe(buildCacheKey('NCT1', 'summarize', 'qwen3'))
  })

  it('treats different prompt types as separate cache entries', () => {
    expect(buildCacheKey('NCT1', 'summarize', 'gemma'))
      .not.toBe(buildCacheKey('NCT1', 'assess_fit', 'gemma'))
  })
})

describe('parseSummarizeStream', () => {
  it('returns summary only when delimiter has not yet streamed', () => {
    const buffer = '## What this study is testing\nThe study tests a new drug.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('The study tests a new drug.')
    expect(result.eligibility).toBeNull()
    expect(result.complete).toBe(false)
  })

  it('splits summary and eligibility once the delimiter has streamed', () => {
    const buffer =
      '## What this study is testing\nThe study tests a new drug.\n\n## Who can join\nAdults 18+.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('The study tests a new drug.')
    expect(result.eligibility).toBe('Adults 18+.')
    expect(result.complete).toBe(true)
  })

  it('handles a partial delimiter line gracefully (still streaming the header)', () => {
    const buffer = '## What this study is testing\nFoo bar.\n\n## Who can'
    const result = parseSummarizeStream(buffer)
    // No complete delimiter yet — still all summary
    expect(result.complete).toBe(false)
    expect(result.eligibility).toBeNull()
  })

  it('strips the leading "## What this study is testing" header from summary', () => {
    const buffer = '## What this study is testing\n\nA paragraph.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('A paragraph.')
  })

  it('tolerates a missing leading header (small-model output that skips it)', () => {
    const buffer = 'A paragraph with no header.\n\n## Who can join\nEligibility text.'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('A paragraph with no header.')
    expect(result.eligibility).toBe('Eligibility text.')
  })

  it('trims surrounding whitespace from both sections', () => {
    const buffer = '## What this study is testing\n\n   Summary text.   \n\n## Who can join\n\n   Elig text.   '
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('Summary text.')
    expect(result.eligibility).toBe('Elig text.')
  })

  it('returns empty string (not null) for summary when buffer is just the header', () => {
    const buffer = '## What this study is testing\n'
    const result = parseSummarizeStream(buffer)
    expect(result.summary).toBe('')
    expect(result.eligibility).toBeNull()
    expect(result.complete).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/utils/simplifyHelpers.test.js
```
Expected: FAIL — `buildCacheKey` not defined

- [ ] **Step 3: Implement `src/utils/simplifyHelpers.js`**

```js
// Cache key for an in-memory Map<key, state>. Includes modelKey because
// switching the underlying LLM should invalidate previously generated text.
export function buildCacheKey(nctId, promptType, modelKey) {
  return `${nctId}:${promptType}:${modelKey}`
}

// Section delimiter for the summarize prompt's structured output. Anchored
// to start-of-line so it doesn't false-match a quoted occurrence in prose.
const ELIGIBILITY_DELIMITER = /^##\s+Who can join\b/m
const SUMMARY_HEADER = /^##\s+What this study is testing[ \t]*\n?/

// Given the running token buffer for an in-flight `summarize` task, return
// what should be rendered right now: { summary, eligibility, complete }.
// Called on every chunk; safe to call with empty or partial buffers.
export function parseSummarizeStream(buffer) {
  const match = buffer.match(ELIGIBILITY_DELIMITER)
  if (!match) {
    return {
      summary: stripSummaryHeader(buffer).trim(),
      eligibility: null,
      complete: false,
    }
  }
  const summaryPart = buffer.slice(0, match.index)
  const eligibilityPart = buffer.slice(match.index + match[0].length)
  return {
    summary: stripSummaryHeader(summaryPart).trim(),
    eligibility: eligibilityPart.trim(),
    complete: true,
  }
}

function stripSummaryHeader(text) {
  return text.replace(SUMMARY_HEADER, '')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/utils/simplifyHelpers.test.js
```
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/simplifyHelpers.js src/utils/simplifyHelpers.test.js
git commit -m "feat: add simplifyHelpers buildCacheKey and parseSummarizeStream"
```

---

## Task 2: Draft AHRQ-target exemplars (USER REVIEW REQUIRED)

**Files:**
- Create: `src/utils/simplifyExemplars.js`

This task is text-only — no executable code, no tests. The exemplars are the "anchor" the small models will imitate. **Stop after this task and ask the user to review the file before proceeding to Task 3.**

- [ ] **Step 1: Create `src/utils/simplifyExemplars.js`**

```js
// Hand-written one-shot exemplars used to anchor the simplification prompts.
//
// Style targets the AHRQ Plain Language guidelines:
//   - 8th-grade reading level
//   - Short sentences (~20 words max)
//   - Common words; define medical terms inline
//   - Active voice
//   - Address the reader as "you"
//   - Hedge with "may" / "might" — never give medical advice
//
// The model imitates these examples better than it follows abstract
// style rules, especially under streaming where bad output is visible
// character-by-character. Cost: ~300 tokens per call.
//
// REVIEW NOTES: edit freely. Reading level matters more than poetry.

export const SUMMARIZE_EXEMPLAR = {
  input: {
    briefSummary:
      'This is a Phase 2 study to evaluate the safety and efficacy of pembrolizumab in combination with chemotherapy for patients with metastatic triple-negative breast cancer who have not received prior systemic therapy.',
    eligibility:
      'Inclusion: Adults aged 18-75 with histologically confirmed metastatic triple-negative breast cancer. ECOG 0-1. Adequate organ function. Exclusion: Prior systemic therapy for metastatic disease. Active autoimmune disease. CNS metastases requiring steroids.',
  },
  output: `## What this study is testing
This study tests pembrolizumab, a kind of immunotherapy that helps your immune system fight cancer. Doctors will combine it with standard chemotherapy. The study is looking at people whose breast cancer has spread to other parts of the body (called metastatic) and who have not yet had cancer drugs for it.

## Who can join
You may be eligible if you are 18 to 75 years old and have triple-negative breast cancer that has spread. You should be able to handle daily activities with little help. You probably cannot join if you have already had cancer drugs for the spread, if you have an autoimmune disease that is currently active, or if cancer in your brain needs steroid treatment.`,
}

export const ASSESS_FIT_EXEMPLAR = {
  input: {
    userDescription:
      '52 year old woman with triple negative breast cancer in NYC, did chemo already',
    extractedFields: {
      condition: 'triple negative breast cancer',
      location: 'NYC',
      age: 52,
      sex: 'FEMALE',
    },
    briefSummary:
      'This is a Phase 2 study to evaluate the safety and efficacy of pembrolizumab in combination with chemotherapy for patients with metastatic triple-negative breast cancer who have not received prior systemic therapy.',
    eligibility:
      'Inclusion: Adults aged 18-75 with histologically confirmed metastatic triple-negative breast cancer. ECOG 0-1. Adequate organ function. Exclusion: Prior systemic therapy for metastatic disease. Active autoimmune disease. CNS metastases requiring steroids.',
  },
  output: `Based on what you described, this trial may not be a fit for you. The study is looking for people who have not yet had cancer drugs for breast cancer that has spread. Since you mentioned you already did chemo, you might not be eligible. It is worth asking the study doctors to be sure — your specific history matters.`,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/simplifyExemplars.js
git commit -m "feat: add AHRQ-target exemplars for simplification prompts"
```

- [ ] **Step 3: PAUSE — ask the user to review `src/utils/simplifyExemplars.js`**

> "Drafted the exemplars at `src/utils/simplifyExemplars.js`. They target AHRQ 8th-grade reading level. Please review and edit anything that doesn't read well; the model will imitate these closely. Let me know when to proceed to Task 3 (prompt builders that wrap them)."

Wait for explicit approval before continuing.

---

## Task 3: Prompt builders

**Files:**
- Modify: `src/utils/simplifyHelpers.js`
- Modify: `src/utils/simplifyHelpers.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/utils/simplifyHelpers.test.js`:

```js
import { buildSummarizePrompt, buildAssessFitPrompt } from './simplifyHelpers'

describe('buildSummarizePrompt', () => {
  const trial = {
    summary: 'A Phase 3 study of drug X in patients with condition Y.',
    eligibility: { criteria: 'Inclusion: adults 18+. Exclusion: pregnancy.' },
  }

  it('includes the trial briefSummary verbatim', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('A Phase 3 study of drug X in patients with condition Y.')
  })

  it('includes the eligibility criteria verbatim', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('Inclusion: adults 18+. Exclusion: pregnancy.')
  })

  it('includes the AHRQ exemplar so the model has a one-shot anchor', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toContain('## What this study is testing')
    expect(prompt).toContain('## Who can join')
    expect(prompt).toContain('pembrolizumab') // from the exemplar
  })

  it('instructs the model on AHRQ-style writing', () => {
    const prompt = buildSummarizePrompt(trial)
    expect(prompt).toMatch(/8th-grade|plain language|short sentences/i)
  })
})

describe('buildAssessFitPrompt', () => {
  const trial = {
    summary: 'A Phase 3 study of drug X.',
    eligibility: { criteria: 'Adults 18+.' },
  }
  const fields = { condition: 'lung cancer', age: 60, sex: 'MALE' }

  it('includes the user description when provided', () => {
    const prompt = buildAssessFitPrompt(trial, fields, '60yo man with lung cancer in Boston')
    expect(prompt).toContain('60yo man with lung cancer in Boston')
  })

  it('includes the extracted condition / age / sex even when no description', () => {
    const prompt = buildAssessFitPrompt(trial, fields, null)
    expect(prompt).toContain('lung cancer')
    expect(prompt).toContain('60')
    expect(prompt).toContain('MALE')
  })

  it('says "(none provided)" for description when null', () => {
    const prompt = buildAssessFitPrompt(trial, fields, null)
    expect(prompt).toMatch(/none provided/i)
  })

  it('includes the trial briefSummary and eligibility', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toContain('A Phase 3 study of drug X.')
    expect(prompt).toContain('Adults 18+.')
  })

  it('includes the assess-fit exemplar', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toContain('Based on what you described') // from the exemplar
  })

  it('instructs the model to hedge and not give medical advice', () => {
    const prompt = buildAssessFitPrompt(trial, fields, 'desc')
    expect(prompt).toMatch(/may|might/i)
    expect(prompt).toMatch(/not give medical advice|talk with the study doctors/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/utils/simplifyHelpers.test.js
```
Expected: FAIL — `buildSummarizePrompt` not defined

- [ ] **Step 3: Add the prompt builders to `src/utils/simplifyHelpers.js`**

Add these imports at the top of `src/utils/simplifyHelpers.js`:

```js
import { SUMMARIZE_EXEMPLAR, ASSESS_FIT_EXEMPLAR } from './simplifyExemplars'
```

Append to the end of `src/utils/simplifyHelpers.js`:

```js
const SUMMARIZE_INSTRUCTIONS = `You translate clinical-trial descriptions into plain language for patients. Write at an 8th-grade reading level. Use short sentences. Use common words. Define medical terms in plain English the first time you use them. Use "you" to address the reader. Be accurate — do not invent details that are not in the source.`

const ASSESS_FIT_INSTRUCTIONS = `You help patients understand whether a clinical trial might fit their situation. Compare what the patient told you against the trial's basic facts and eligibility. Write 2 to 4 sentences. Be honest about uncertainty — say "may" or "might" rather than "will" or "should." Do not give medical advice. Suggest the patient talk with the study doctors when their specific history matters.`

export function buildSummarizePrompt(trial) {
  const ex = SUMMARIZE_EXEMPLAR
  return `${SUMMARIZE_INSTRUCTIONS}

Here is an example.

SOURCE TRIAL:
Brief summary: ${ex.input.briefSummary}
Eligibility: ${ex.input.eligibility}

PLAIN-LANGUAGE OUTPUT:
${ex.output}

Now do the same for this trial.

SOURCE TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}

PLAIN-LANGUAGE OUTPUT:
`
}

export function buildAssessFitPrompt(trial, fields, userDescription) {
  const ex = ASSESS_FIT_EXEMPLAR
  const descLine = userDescription
    ? `What they said: ${userDescription}`
    : `What they said: (none provided)`
  return `${ASSESS_FIT_INSTRUCTIONS}

Here is an example.

PATIENT:
What they said: ${ex.input.userDescription}
Their condition: ${ex.input.extractedFields.condition}, age ${ex.input.extractedFields.age}, ${ex.input.extractedFields.sex}

TRIAL:
Brief summary: ${ex.input.briefSummary}
Eligibility: ${ex.input.eligibility}

ASSESSMENT:
${ex.output}

Now do the same.

PATIENT:
${descLine}
Their condition: ${fields?.condition ?? 'not given'}, age ${fields?.age ?? 'not given'}, ${fields?.sex ?? 'not given'}

TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}

ASSESSMENT:
`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/utils/simplifyHelpers.test.js
```
Expected: all tests PASS (8 from Task 1 + new ones)

- [ ] **Step 5: Commit**

```bash
git add src/utils/simplifyHelpers.js src/utils/simplifyHelpers.test.js
git commit -m "feat: add buildSummarizePrompt and buildAssessFitPrompt with exemplar anchors"
```

---

## Task 4: Worker — streaming summarize and assess_fit

**Files:**
- Modify: `src/workers/nlp.worker.js`

No direct unit tests — the worker runs in a browser-only context. It is exercised through the mocked-Worker tests in Task 5 and the manual smoke test in Task 8.

- [ ] **Step 1: Replace `src/workers/nlp.worker.js`**

```js
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
  const { type, text, modelId, isThinking, taskId, prompt } = event.data

  if (type === 'load') {
    if (engine) { self.postMessage({ type: 'ready' }); return }
    if (loading) return
    loading = true
    isThinkingModel = Boolean(isThinking)
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      engine = await CreateMLCEngine(modelId ?? DEFAULT_MODEL_ID, {
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
    return
  }

  if (type === 'extract') {
    if (!engine) {
      self.postMessage({ type: 'error', message: 'Engine not loaded' })
      return
    }
    try {
      const request = {
        messages: [{ role: 'user', content: text }],
        max_tokens: 200,
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
      const request = {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: type === 'summarize' ? 500 : 250,
        temperature: 0.2,
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
```

- [ ] **Step 2: Verify no test regressions**

```bash
npm run test:run
```
Expected: all existing tests still PASS (no new tests in this task; the worker is exercised in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/workers/nlp.worker.js
git commit -m "feat: extend nlp.worker with streaming summarize and assess_fit message types"
```

---

## Task 5: `useSimplifier` hook

**Files:**
- Create: `src/hooks/useSimplifier.js`
- Create: `src/hooks/useSimplifier.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/hooks/useSimplifier.test.js`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSimplifier } from './useSimplifier'

const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWorker.onmessage = null
  mockWorker.onerror = null
  vi.stubGlobal('Worker', vi.fn(() => mockWorker))
  vi.stubGlobal('navigator', { gpu: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const trial = {
  nctId: 'NCT001',
  summary: 'A Phase 3 study of drug X.',
  eligibility: { criteria: 'Adults 18+.' },
}

const props = {
  modelKey: 'gemma',
  userDescription: null,
  extractedFields: null,
}

describe('useSimplifier — initial state', () => {
  it('starts with empty states map', () => {
    const { result } = renderHook(() => useSimplifier(props))
    expect(result.current.states.size).toBe(0)
  })
})

describe('useSimplifier — enqueueSummarize', () => {
  it('marks the trial as queued and posts a summarize message to the worker', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.status).toMatch(/queued|streaming/)
    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')
    expect(call).toBeDefined()
    expect(call[0].prompt).toContain('A Phase 3 study of drug X.')
    expect(typeof call[0].taskId).toBe('string')
  })

  it('is a no-op when the trial is already cached as complete', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n## Who can join\nBar.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    mockWorker.postMessage.mockClear()
    act(() => result.current.enqueueSummarize(trial))
    expect(mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')).toBeUndefined()
  })

  it('updates summary as chunks stream in (delimiter not yet emitted)', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nThis study tests' } }))
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: ' a new drug.' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.summary).toBe('This study tests a new drug.')
    expect(state.summarize.eligibility).toBeNull()
  })

  it('splits summary and eligibility once the delimiter chunk arrives', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n\n## Who can join\nAdults 18+.' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.summary).toBe('Foo.')
    expect(state.summarize.eligibility).toBe('Adults 18+.')
  })

  it('marks status complete on task_done', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: '## What this study is testing\nFoo.\n## Who can join\nBar.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    expect(result.current.states.get('NCT001').summarize.status).toBe('complete')
  })

  it('marks status error and stores message on task_error', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_error', taskId, message: 'engine crashed' } }))
    const state = result.current.states.get('NCT001')
    expect(state.summarize.status).toBe('error')
    expect(state.summarize.error).toBe('engine crashed')
  })
})

describe('useSimplifier — enqueueAssessFit', () => {
  it('is a no-op when no extractedFields are provided', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueAssessFit(trial))
    expect(mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')).toBeUndefined()
  })

  it('posts an assess_fit message when extractedFields exist', () => {
    const withFields = { ...props, extractedFields: { condition: 'cancer', age: 50, sex: 'FEMALE' } }
    const { result } = renderHook(() => useSimplifier(withFields))
    act(() => result.current.enqueueAssessFit(trial))
    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')
    expect(call).toBeDefined()
    expect(call[0].prompt).toContain('cancer')
  })

  it('streams the fit paragraph into state.fit.text', () => {
    const withFields = { ...props, extractedFields: { condition: 'cancer', age: 50, sex: 'FEMALE' } }
    const { result } = renderHook(() => useSimplifier(withFields))
    act(() => result.current.enqueueAssessFit(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'assess_fit')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: 'This trial may fit you.' } }))
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    const state = result.current.states.get('NCT001')
    expect(state.fit.text).toBe('This trial may fit you.')
    expect(state.fit.status).toBe('complete')
  })
})

describe('useSimplifier — queue ordering', () => {
  it('processes tasks one at a time in FIFO order', () => {
    const trial2 = { ...trial, nctId: 'NCT002' }
    const { result } = renderHook(() => useSimplifier(props))
    act(() => {
      result.current.enqueueSummarize(trial)
      result.current.enqueueSummarize(trial2)
    })
    const summarizeCalls = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCalls).toHaveLength(1)
    expect(summarizeCalls[0][0].prompt).toContain('A Phase 3 study of drug X.')
    const firstTaskId = summarizeCalls[0][0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId: firstTaskId } }))
    const summarizeCallsAfter = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCallsAfter).toHaveLength(2)
  })
})

describe('useSimplifier — cancelPending and resetCache', () => {
  it('cancelPending drops queued tasks but lets the in-flight one finish', () => {
    const trial2 = { ...trial, nctId: 'NCT002' }
    const { result } = renderHook(() => useSimplifier(props))
    act(() => {
      result.current.enqueueSummarize(trial)
      result.current.enqueueSummarize(trial2)
    })
    act(() => result.current.cancelPending())
    const firstTaskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId: firstTaskId } }))
    const summarizeCallsAfter = mockWorker.postMessage.mock.calls.filter(c => c[0].type === 'summarize')
    expect(summarizeCallsAfter).toHaveLength(1)
  })

  it('resetCache empties the states map', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    expect(result.current.states.size).toBe(1)
    act(() => result.current.resetCache())
    expect(result.current.states.size).toBe(0)
  })

  it('discards chunks for taskIds that no longer correspond to any cached state', () => {
    const { result } = renderHook(() => useSimplifier(props))
    act(() => result.current.enqueueSummarize(trial))
    const taskId = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'summarize')[0].taskId
    act(() => result.current.resetCache())
    expect(() => {
      act(() => mockWorker.onmessage({ data: { type: 'chunk', taskId, text: 'late' } }))
      act(() => mockWorker.onmessage({ data: { type: 'task_done', taskId } }))
    }).not.toThrow()
    expect(result.current.states.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/hooks/useSimplifier.test.js
```
Expected: FAIL — `useSimplifier` not defined

- [ ] **Step 3: Implement `src/hooks/useSimplifier.js`**

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildCacheKey,
  buildSummarizePrompt,
  buildAssessFitPrompt,
  parseSummarizeStream,
} from '../utils/simplifyHelpers'

const initialSummarize = () => ({ status: 'queued', buffer: '', summary: '', eligibility: null, error: null })
const initialFit = () => ({ status: 'queued', text: '', error: null })

let nextTaskId = 0
const newTaskId = () => `t${++nextTaskId}`

export function useSimplifier({ modelKey, userDescription, extractedFields }) {
  const [states, setStates] = useState(() => new Map())
  const queueRef = useRef([]) // { taskId, type, nctId, prompt }
  const inFlightRef = useRef(null) // { taskId, type, nctId }
  const taskIndexRef = useRef(new Map()) // taskId -> { nctId, type }
  const workerRef = useRef(null)

  function ensureWorker() {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../workers/nlp.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = handleWorkerMessage
    worker.onerror = (err) => {
      // Surface as a task_error if there is something in flight
      if (inFlightRef.current) {
        applyTaskError(inFlightRef.current.taskId, err?.message ?? 'worker crashed')
      }
    }
    return worker
  }

  function handleWorkerMessage(event) {
    const { type, taskId, text, message } = event.data ?? {}
    if (!taskId) return // not a Phase 3 message; the NLP hook owns 'extract' responses
    const meta = taskIndexRef.current.get(taskId)
    if (!meta) return // task was cancelled / cache reset

    if (type === 'chunk') {
      applyChunk(meta, taskId, text ?? '')
    } else if (type === 'task_done') {
      applyTaskDone(meta, taskId)
      maybeStartNext()
    } else if (type === 'task_error') {
      applyTaskError(taskId, message ?? 'unknown error')
      maybeStartNext()
    }
  }

  function applyChunk(meta, taskId, text) {
    setStates(prev => {
      const next = new Map(prev)
      const cur = next.get(meta.nctId)
      if (!cur) return prev
      if (meta.type === 'summarize') {
        const buffer = cur.summarize.buffer + text
        const parsed = parseSummarizeStream(buffer)
        next.set(meta.nctId, {
          ...cur,
          summarize: {
            ...cur.summarize,
            status: 'streaming',
            buffer,
            summary: parsed.summary,
            eligibility: parsed.eligibility,
          },
        })
      } else {
        next.set(meta.nctId, {
          ...cur,
          fit: { ...cur.fit, status: 'streaming', text: cur.fit.text + text },
        })
      }
      return next
    })
  }

  function applyTaskDone(meta, taskId) {
    setStates(prev => {
      const next = new Map(prev)
      const cur = next.get(meta.nctId)
      if (!cur) return prev
      if (meta.type === 'summarize') {
        next.set(meta.nctId, { ...cur, summarize: { ...cur.summarize, status: 'complete' } })
      } else {
        next.set(meta.nctId, { ...cur, fit: { ...cur.fit, status: 'complete' } })
      }
      return next
    })
    taskIndexRef.current.delete(taskId)
    inFlightRef.current = null
  }

  function applyTaskError(taskId, message) {
    const meta = taskIndexRef.current.get(taskId)
    if (meta) {
      setStates(prev => {
        const next = new Map(prev)
        const cur = next.get(meta.nctId)
        if (!cur) return prev
        if (meta.type === 'summarize') {
          next.set(meta.nctId, {
            ...cur,
            summarize: { ...cur.summarize, status: 'error', error: message },
          })
        } else {
          next.set(meta.nctId, {
            ...cur,
            fit: { ...cur.fit, status: 'error', error: message },
          })
        }
        return next
      })
      taskIndexRef.current.delete(taskId)
    }
    inFlightRef.current = null
  }

  function maybeStartNext() {
    if (inFlightRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    inFlightRef.current = { taskId: next.taskId, type: next.type, nctId: next.nctId }
    taskIndexRef.current.set(next.taskId, { nctId: next.nctId, type: next.type })
    ensureWorker().postMessage({ type: next.type, taskId: next.taskId, prompt: next.prompt })
  }

  const enqueueSummarize = useCallback((trial) => {
    const nctId = trial.nctId
    setStates(prev => {
      const cur = prev.get(nctId)
      // Skip if already complete or in progress
      if (cur?.summarize && (cur.summarize.status === 'complete' || cur.summarize.status === 'streaming' || cur.summarize.status === 'queued')) {
        return prev
      }
      const next = new Map(prev)
      next.set(nctId, { ...(cur ?? {}), summarize: initialSummarize() })
      return next
    })
    // Dedupe at the queue level too (covers race where two enqueues fire
    // in the same render before state updates)
    if (queueRef.current.find(t => t.nctId === nctId && t.type === 'summarize')) return
    if (inFlightRef.current?.nctId === nctId && inFlightRef.current?.type === 'summarize') return
    const taskId = newTaskId()
    queueRef.current.push({
      taskId,
      type: 'summarize',
      nctId,
      prompt: buildSummarizePrompt(trial),
    })
    maybeStartNext()
  }, [modelKey])

  const enqueueAssessFit = useCallback((trial) => {
    if (!extractedFields) return
    const nctId = trial.nctId
    setStates(prev => {
      const cur = prev.get(nctId)
      if (cur?.fit && (cur.fit.status === 'complete' || cur.fit.status === 'streaming' || cur.fit.status === 'queued')) {
        return prev
      }
      const next = new Map(prev)
      next.set(nctId, { ...(cur ?? {}), fit: initialFit() })
      return next
    })
    if (queueRef.current.find(t => t.nctId === nctId && t.type === 'assess_fit')) return
    if (inFlightRef.current?.nctId === nctId && inFlightRef.current?.type === 'assess_fit') return
    const taskId = newTaskId()
    queueRef.current.push({
      taskId,
      type: 'assess_fit',
      nctId,
      prompt: buildAssessFitPrompt(trial, extractedFields, userDescription),
    })
    maybeStartNext()
  }, [extractedFields, userDescription, modelKey])

  const cancelPending = useCallback(() => {
    queueRef.current = []
    // In-flight task continues; its result is discarded if the cache is
    // also reset, or merged into state if the same nctId is still cached.
  }, [])

  const resetCache = useCallback(() => {
    queueRef.current = []
    taskIndexRef.current = new Map()
    setStates(new Map())
    // inFlightRef is intentionally NOT cleared — its echo will be ignored
    // by handleWorkerMessage because taskIndexRef no longer maps the id.
  }, [])

  // Tear down the worker on unmount
  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

  return { states, enqueueSummarize, enqueueAssessFit, cancelPending, resetCache }
}
```

> **Note for the implementer:** This hook intentionally does **not** call `load()` on the worker. Phase 2's `useNLP` is responsible for loading the model. Phase 3 just sends `summarize` / `assess_fit` messages to the same worker module URL. Vite returns the same module instance for the same URL, but each `new Worker(...)` call creates a separate worker thread — so this hook actually owns its own worker (with no model loaded). **This is a known gap that Task 7 resolves** by making `ResultsList` only enqueue tasks once `useNLP` reports `status === 'ready'` and by *sharing the worker reference*. For now, the hook tests use a stubbed Worker that doesn't care.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/hooks/useSimplifier.test.js
```
Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSimplifier.js src/hooks/useSimplifier.test.js
git commit -m "feat: add useSimplifier hook with FIFO queue, in-memory cache, streaming"
```

---

## Task 6: Share the worker between `useNLP` and `useSimplifier`

**Files:**
- Create: `src/workers/sharedNlpWorker.js`
- Modify: `src/hooks/useNLP.js`
- Modify: `src/hooks/useSimplifier.js`
- Modify: `src/hooks/useNLP.test.js` (only if necessary — see below)

The current design has two hooks each instantiating their own Worker. Phase 3 *requires* the model loaded by `useNLP` to be the same one used by `useSimplifier`. We extract a shared module-singleton getter.

- [ ] **Step 1: Create `src/workers/sharedNlpWorker.js`**

```js
// Module-singleton accessor for the single nlp.worker.js instance shared
// between useNLP (loads the model + runs Phase 2 extraction) and
// useSimplifier (runs Phase 3 summarize/assess_fit on the same loaded
// model). Each hook attaches its own message handler via the bus pattern
// (see attachListener / detachListener) so worker.onmessage isn't
// monopolized.

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
```

- [ ] **Step 2: Update `src/hooks/useNLP.js` to use the shared worker**

Replace the body of `initWorker` and the `useEffect` cleanup. Full new file:

```js
import { useState, useEffect, useRef, useCallback } from 'react'
import { buildPrompt, parseExtraction } from '../utils/nlpHelpers'
import { getSharedWorker, attachListener, terminateSharedWorker } from '../workers/sharedNlpWorker'

export function useNLP() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [webGPUSupported] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator
  )
  const pendingRef = useRef(null)
  const detachRef = useRef(null)

  useEffect(() => {
    return () => {
      detachRef.current?.()
      // Worker is owned at module scope and may be in use by useSimplifier;
      // do NOT terminate on unmount. Termination is left to a higher-level
      // caller (currently nothing terminates it — model is preserved across
      // mount/unmount of NaturalLanguageInput).
    }
  }, [])

  function ensureSubscribed() {
    if (detachRef.current) return
    detachRef.current = attachListener(handleMessage)
  }

  function handleMessage(event) {
    const { type, progress: p, raw, message } = event.data ?? {}
    // Phase 3 messages have a taskId field; ignore them in this hook.
    if (event.data?.taskId) return

    if (type === 'progress') {
      setStatus('downloading')
      setProgress(p)
    } else if (type === 'ready') {
      setStatus('ready')
      setProgress(null)
    } else if (type === 'result') {
      setStatus('ready')
      if (pendingRef.current) {
        pendingRef.current.resolve(parseExtraction(raw))
        pendingRef.current = null
      }
    } else if (type === 'error') {
      if (pendingRef.current) {
        setStatus('ready')
        pendingRef.current.resolve(null)
        pendingRef.current = null
      } else {
        setStatus('error')
        setError(message)
      }
    }
  }

  const load = useCallback((modelId, options = {}) => {
    if (!webGPUSupported) return
    // The shared worker stays alive across panel toggles; we just send a
    // fresh load message. Retry-after-error currently requires a page
    // reload — acceptable for v1 since the worker preserves model state
    // across normal use.
    setError(null)
    ensureSubscribed()
    setStatus('downloading')
    getSharedWorker().postMessage({
      type: 'load',
      modelId,
      isThinking: Boolean(options.isThinking),
    })
  }, [webGPUSupported])

  const extract = useCallback((text) => {
    ensureSubscribed()
    if (pendingRef.current) return Promise.reject(new Error('Extraction already in progress'))
    return new Promise((resolve) => {
      setStatus('extracting')
      pendingRef.current = { resolve }
      getSharedWorker().postMessage({ type: 'extract', text: buildPrompt(text) })
    })
  }, [])

  return { status, progress, error, webGPUSupported, load, extract }
}
```

> **Behavior change vs Phase 2:** the shared-worker version no longer terminates on `useNLP` unmount and no longer recreates on retry. The trade-off: panel toggles preserve the loaded model (good UX), but a hard error requires page reload to recover (acceptable for v1; `useSimplifier` would also be torn out by a reload).

- [ ] **Step 3: Update `src/hooks/useSimplifier.js` to use the shared worker**

Replace the `ensureWorker` function and the worker-related refs/cleanup. The new top of the hook (replacing the existing `function ensureWorker` and the `useEffect` cleanup at the bottom):

```js
import { getSharedWorker, attachListener } from '../workers/sharedNlpWorker'

// (inside useSimplifier, replace the existing workerRef/ensureWorker and the unmount useEffect)

const detachRef = useRef(null)

function ensureSubscribed() {
  if (detachRef.current) return
  detachRef.current = attachListener(handleWorkerMessage)
}

useEffect(() => {
  return () => { detachRef.current?.() }
}, [])

// Replace the body of maybeStartNext to use getSharedWorker():
function maybeStartNext() {
  if (inFlightRef.current) return
  const next = queueRef.current.shift()
  if (!next) return
  ensureSubscribed()
  inFlightRef.current = { taskId: next.taskId, type: next.type, nctId: next.nctId }
  taskIndexRef.current.set(next.taskId, { nctId: next.nctId, type: next.type })
  getSharedWorker().postMessage({ type: next.type, taskId: next.taskId, prompt: next.prompt })
}
```

And remove the old `workerRef`, `ensureWorker()`, and the `worker.onerror` setup — `attachListener` handles error events at the bus level.

- [ ] **Step 4: Reset the shared worker between tests**

The shared module-singleton in `sharedNlpWorker.js` caches the worker instance for the lifetime of the test process. Without explicit reset, the second test sees the first test's stubbed worker — even after `vi.unstubAllGlobals()` runs. **Required edit to both `src/hooks/useNLP.test.js` and `src/hooks/useSimplifier.test.js`:**

Add this import alongside the existing imports:

```js
import { terminateSharedWorker } from '../workers/sharedNlpWorker'
```

Add this line at the top of every `beforeEach` block (before `vi.stubGlobal('Worker', …)`):

```js
terminateSharedWorker()
```

Verify: re-run each test file individually after this edit and confirm no cross-test contamination. The Phase 2 `useNLP` tests should still pass without changes to their assertions.

- [ ] **Step 5: Run the full suite to verify nothing regressed**

```bash
npm run test:run
```
Expected: all tests PASS (Phase 2 + Phase 3)

- [ ] **Step 6: Commit**

```bash
git add src/workers/sharedNlpWorker.js src/hooks/useNLP.js src/hooks/useNLP.test.js src/hooks/useSimplifier.js src/hooks/useSimplifier.test.js
git commit -m "refactor: extract shared worker singleton so useNLP and useSimplifier share one model"
```

---

## Task 7: `ResultCard` — render simplified sections

**Files:**
- Modify: `src/components/ResultCard.jsx`
- Modify: `src/components/ResultCard.test.jsx`

`ResultCard` gains a `simplification` prop (the per-trial state from `useSimplifier`) and an `onRequestSimplify` callback for the on-demand button.

- [ ] **Step 1: Read existing tests to follow the file's testing conventions**

```bash
cat src/components/ResultCard.test.jsx
```

- [ ] **Step 2: Add failing tests**

Append to `src/components/ResultCard.test.jsx`:

```jsx
import { fireEvent } from '@testing-library/react'
// (existing imports remain)

const trial = {
  nctId: 'NCT001',
  title: 'Drug X for Y',
  status: 'RECRUITING',
  phases: ['PHASE2'],
  summary: 'A Phase 2 study of drug X.',
  eligibility: { criteria: 'Adults 18+.', minAge: '18 Years', sex: 'ALL' },
  interventions: [],
  contact: {},
  locations: [],
  ctGovUrl: 'https://example.com',
}

describe('ResultCard — Phase 3 simplification', () => {
  it('renders only the original prose when no simplification prop is provided', () => {
    render(<ResultCard trial={trial} coords={null} />)
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
    expect(screen.queryByText(/What this study is testing/i)).not.toBeInTheDocument()
  })

  it('renders the on-demand button when simplification is undefined and onRequestSimplify is provided', () => {
    render(
      <ResultCard
        trial={trial}
        coords={null}
        simplification={undefined}
        onRequestSimplify={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /show in plain language/i })).toBeInTheDocument()
  })

  it('calls onRequestSimplify when the on-demand button is clicked', () => {
    const onRequestSimplify = vi.fn()
    render(
      <ResultCard
        trial={trial}
        coords={null}
        simplification={undefined}
        onRequestSimplify={onRequestSimplify}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /show in plain language/i }))
    expect(onRequestSimplify).toHaveBeenCalledWith(trial)
  })

  it('renders the streaming summary as it grows', () => {
    const simplification = {
      summarize: { status: 'streaming', summary: 'This study tests', eligibility: null, error: null },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('This study tests')).toBeInTheDocument()
    expect(screen.getByText(/Generating plain-language summary/i)).toBeInTheDocument()
  })

  it('renders both sections when both have streamed', () => {
    const simplification = {
      summarize: {
        status: 'streaming',
        summary: 'Plain summary.',
        eligibility: 'Plain eligibility.',
        error: null,
      },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('Plain summary.')).toBeInTheDocument()
    expect(screen.getByText('Plain eligibility.')).toBeInTheDocument()
  })

  it('renders the collapsible "Show clinical summary" with the original prose when complete', () => {
    const simplification = {
      summarize: {
        status: 'complete',
        summary: 'Plain summary.',
        eligibility: 'Plain eligibility.',
        error: null,
      },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText(/Show clinical summary/i)).toBeInTheDocument()
    // The original is in a <details> — present in the DOM, just collapsed
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
  })

  it('falls back to the original prose with hint when summarize errors', () => {
    const simplification = {
      summarize: { status: 'error', summary: '', eligibility: null, error: 'engine crashed' },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText('A Phase 2 study of drug X.')).toBeInTheDocument()
    expect(screen.getByText(/Plain-language version unavailable/i)).toBeInTheDocument()
  })

  it('renders the fit paragraph when fit state is complete', () => {
    const simplification = {
      summarize: { status: 'complete', summary: 'Sum.', eligibility: 'Elig.', error: null },
      fit: { status: 'complete', text: 'This may fit you because…', error: null },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.getByText(/Why this might or might not fit you/i)).toBeInTheDocument()
    expect(screen.getByText('This may fit you because…')).toBeInTheDocument()
  })

  it('does not render fit section when fit is in error', () => {
    const simplification = {
      summarize: { status: 'complete', summary: 'Sum.', eligibility: 'Elig.', error: null },
      fit: { status: 'error', text: '', error: 'failed' },
    }
    render(<ResultCard trial={trial} coords={null} simplification={simplification} />)
    expect(screen.queryByText(/Why this might or might not fit you/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test:run -- src/components/ResultCard.test.jsx
```
Expected: most new tests FAIL — component doesn't render the new states yet

- [ ] **Step 4: Replace `src/components/ResultCard.jsx`**

```jsx
import PhaseExplainer from './PhaseExplainer'
import { nearestLocation } from '../utils/apiHelpers'

const STATUS_STYLES = {
  RECRUITING: 'bg-green-100 text-green-800',
  NOT_YET_RECRUITING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-600',
  TERMINATED: 'bg-red-100 text-red-700',
}

export default function ResultCard({ trial, coords, simplification, onRequestSimplify }) {
  const nearest = nearestLocation(trial.locations, coords)

  const sumState = simplification?.summarize
  const fitState = simplification?.fit

  const showPlainLanguage = sumState && sumState.status !== 'error'
  const showFallbackHint = sumState?.status === 'error'
  const showFit = fitState && fitState.status !== 'error' && fitState.text

  return (
    <article className="bg-white border border-parchment-400 rounded-lg p-5 mb-3 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="text-base font-semibold text-parchment-950 leading-snug">{trial.title}</h3>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            STATUS_STYLES[trial.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {trial.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-parchment-800 mb-3">
        <PhaseExplainer phases={trial.phases} />
        {nearest && (
          <>
            <span className="text-parchment-500">·</span>
            <span>
              {nearest.facility ? `${nearest.facility}, ` : ''}
              {nearest.city}, {nearest.state}
            </span>
            <span className="text-parchment-500">·</span>
            <span>{nearest.distanceMi} mi away</span>
          </>
        )}
        {!nearest && trial.locations.length > 0 && (
          <>
            <span className="text-parchment-500">·</span>
            <span>
              {trial.locations[0].city}, {trial.locations[0].state}
            </span>
          </>
        )}
      </div>

      {/* PLAIN-LANGUAGE BLOCK — only when simplification is present */}
      {showPlainLanguage && (
        <div className="mb-3">
          <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
            What this study is testing
          </h4>
          <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
            {sumState.summary || ' '}
          </p>

          {sumState.eligibility != null && (
            <>
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
                Who can join
              </h4>
              <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
                {sumState.eligibility || ' '}
              </p>
            </>
          )}

          {showFit && (
            <>
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-1">
                Why this might or might not fit you
              </h4>
              <p className="text-sm text-parchment-900 leading-relaxed mb-3 whitespace-pre-wrap">
                {fitState.text}
              </p>
            </>
          )}

          {sumState.status === 'streaming' && (
            <p className="text-xs text-parchment-600 italic mb-2">
              Generating plain-language summary…
            </p>
          )}

          {sumState.status === 'complete' && trial.summary && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-parchment-700 hover:text-parchment-950">
                Show clinical summary
              </summary>
              <div className="mt-2 pl-3 border-l-2 border-parchment-300">
                <p className="text-sm text-parchment-900 leading-relaxed mb-2">{trial.summary}</p>
                {trial.eligibility?.criteria && (
                  <p className="text-xs text-parchment-800 whitespace-pre-wrap">
                    <span className="font-medium">Eligibility:</span>{' '}
                    {trial.eligibility.criteria}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ON-DEMAND BUTTON — when no simplification yet and a callback is wired */}
      {!simplification && onRequestSimplify && (
        <button
          type="button"
          onClick={() => onRequestSimplify(trial)}
          className="text-xs text-parchment-800 underline hover:text-parchment-950 mb-2"
        >
          Show in plain language
        </button>
      )}

      {/* ORIGINAL PROSE — shown when no simplification (default Phase 1 path) */}
      {!showPlainLanguage && trial.summary && (
        <p className="text-sm text-parchment-900 leading-relaxed mb-3">{trial.summary}</p>
      )}

      {/* FAILURE HINT */}
      {showFallbackHint && (
        <p className="text-xs text-parchment-600 italic mb-3">
          Plain-language version unavailable for this trial.
        </p>
      )}

      {/* Existing eligibility-summary line */}
      {(trial.eligibility.minAge || trial.eligibility.sex !== 'ALL') && !showPlainLanguage && (
        <p className="text-xs text-parchment-800 mb-3">
          <span className="font-medium">Who can join:</span>{' '}
          {[
            trial.eligibility.minAge && `${trial.eligibility.minAge}+`,
            trial.eligibility.sex !== 'ALL' &&
              trial.eligibility.sex.charAt(0) + trial.eligibility.sex.slice(1).toLowerCase(),
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <a
          href={trial.ctGovUrl}
          target="_blank"
          rel="noreferrer"
          className="text-parchment-800 underline hover:text-parchment-950"
        >
          View full details on ClinicalTrials.gov →
        </a>
        {trial.contact.phone && (
          <span className="text-parchment-700">{trial.contact.phone}</span>
        )}
        {trial.contact.email && (
          <a
            href={`mailto:${trial.contact.email}`}
            className="text-parchment-700 underline hover:text-parchment-950"
          >
            {trial.contact.email}
          </a>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run -- src/components/ResultCard.test.jsx
```
Expected: all ResultCard tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/components/ResultCard.jsx src/components/ResultCard.test.jsx
git commit -m "feat: render plain-language sections, on-demand button, and collapsible original in ResultCard"
```

---

## Task 8: `ResultsList` orchestration + App / NLP wiring

**Files:**
- Modify: `src/components/ResultsList.jsx`
- Modify: `src/components/NaturalLanguageInput.jsx`
- Modify: `src/components/NaturalLanguageInput.test.jsx`
- Modify: `src/App.jsx`

This task wires Phase 3 end-to-end. Three coupled changes:
1. `NaturalLanguageInput` calls `onExtract({ fields, description })` instead of `onExtract(fields)`
2. `App` lifts `modelKey` resolution and stores `userDescription` alongside `prefill`
3. `ResultsList` instantiates `useSimplifier` and orchestrates the eager batch + on-demand callback

- [ ] **Step 1: Update `NaturalLanguageInput` to pass description**

In `src/components/NaturalLanguageInput.jsx`, change `handleSubmit`:

```jsx
async function handleSubmit(e) {
  e.preventDefault()
  if (!text.trim()) return
  const fields = await extract(text.trim())
  setExtracted(fields)
  if (fields && typeof onExtract === 'function') {
    onExtract({ fields, description: text.trim() })
  }
}
```

- [ ] **Step 2: Update `NaturalLanguageInput.test.jsx`**

Find the existing test that asserts the `onExtract` payload and update it. The relevant existing test:

```jsx
await waitFor(() => expect(onExtract).toHaveBeenCalledWith(
  expect.objectContaining({ condition: 'breast cancer' })
))
```

Change to:

```jsx
await waitFor(() => expect(onExtract).toHaveBeenCalledWith(
  expect.objectContaining({
    fields: expect.objectContaining({ condition: 'breast cancer' }),
    description: '52yo woman with breast cancer',
  })
))
```

(Update the `description` value to whatever the test types into the textarea — search for `user.type` or `fireEvent.change` calls in the same test.)

- [ ] **Step 3: Update `App.jsx`**

Replace the `IrisApp` body:

```jsx
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './components/Header'
import DedicationBanner from './components/DedicationBanner'
import PrivacyStatement from './components/PrivacyStatement'
import SearchForm from './components/SearchForm'
import NaturalLanguageInput from './components/NaturalLanguageInput'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'
import { resolveModelKey } from './utils/nlpModels'

const queryClient = new QueryClient()

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [userDescription, setUserDescription] = useState(null)

  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )

  function handleExtract({ fields, description }) {
    setPrefill(fields)
    setUserDescription(description)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <Header />
      <DedicationBanner />
      <PrivacyStatement />
      <main className="flex-1">
        <NaturalLanguageInput onExtract={handleExtract} />
        <SearchForm onSearch={setSearchParams} prefill={prefill} />
        {searchParams && (
          <ResultsList
            searchParams={searchParams}
            modelKey={modelKey}
            userDescription={userDescription}
            extractedFields={prefill}
          />
        )}
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IrisApp />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 4: Update `ResultsList.jsx`**

```jsx
import { useEffect } from 'react'
import { useGeocode } from '../hooks/useGeocode'
import { useClinicalTrials } from '../hooks/useClinicalTrials'
import { useSimplifier } from '../hooks/useSimplifier'
import ResultCard from './ResultCard'

const EAGER_BATCH_SIZE = 5

export default function ResultsList({ searchParams, modelKey, userDescription, extractedFields }) {
  const {
    data: coords,
    isError: geoFailed,
    isLoading: geoLoading,
  } = useGeocode(searchParams.location)

  const showGeoFallback = searchParams.location && geoFailed
  const geocodeSettled = !searchParams.location || !geoLoading

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useClinicalTrials(searchParams, coords ?? null, !geocodeSettled)

  const simplifier = useSimplifier({
    modelKey,
    userDescription,
    extractedFields,
  })

  const allTrials = data?.pages.flatMap(p => p.trials) ?? []

  // Eager batch on every search change. resetCache + cancelPending wipe stale
  // simplifications from the previous query.
  useEffect(() => {
    simplifier.cancelPending()
    simplifier.resetCache()
    if (allTrials.length === 0) return
    const eager = allTrials.slice(0, EAGER_BATCH_SIZE)
    for (const t of eager) simplifier.enqueueSummarize(t)
    if (extractedFields) {
      for (const t of eager) simplifier.enqueueAssessFit(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (isLoading) {
    return (
      <div className="px-6 py-8 text-sm text-parchment-800" aria-live="polite">
        {showGeoFallback && (
          <p className="text-xs text-parchment-700 mb-3 italic">
            Couldn&apos;t pinpoint that location — showing results without distance filtering.
          </p>
        )}
        Searching ClinicalTrials.gov…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-6 py-8 max-w-xl" role="alert">
        <p className="text-sm text-parchment-900 font-medium mb-1">
          We couldn&apos;t reach ClinicalTrials.gov right now.
        </p>
        <p className="text-sm text-parchment-800">
          This might be a temporary issue — please try again in a few minutes.
        </p>
      </div>
    )
  }

  const totalCount = data?.pages[0]?.totalCount ?? 0

  if (allTrials.length === 0) {
    return (
      <div className="px-6 py-8 max-w-xl" aria-live="polite">
        <p className="text-sm font-medium text-parchment-950 mb-2">No trials found.</p>
        <p className="text-sm text-parchment-800 mb-1">Try:</p>
        <ul className="text-sm text-parchment-800 list-disc list-inside space-y-1">
          {searchParams.location && <li>Removing the location filter</li>}
          <li>Broadening to all phases</li>
          <li>Using different condition phrasing (e.g. &quot;TNBC&quot; vs &quot;triple negative breast cancer&quot;)</li>
          <li>Setting recruitment status to &quot;All&quot;</li>
        </ul>
      </div>
    )
  }

  function handleRequestSimplify(trial) {
    simplifier.enqueueSummarize(trial)
    if (extractedFields) simplifier.enqueueAssessFit(trial)
  }

  return (
    <section className="px-6 py-6" aria-live="polite" aria-label="Search results">
      {showGeoFallback && (
        <p className="text-xs text-parchment-700 mb-3 italic">
          Couldn&apos;t pinpoint that location — showing results without distance filtering.
        </p>
      )}

      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm text-parchment-800">
          {totalCount.toLocaleString()} trial{totalCount !== 1 ? 's' : ''} found
        </p>
      </div>

      {allTrials.map(trial => (
        <ResultCard
          key={trial.nctId}
          trial={trial}
          coords={coords ?? null}
          simplification={simplifier.states.get(trial.nctId)}
          onRequestSimplify={handleRequestSimplify}
        />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 text-sm text-parchment-800 underline hover:text-parchment-950 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more results'}
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Run the full test suite**

```bash
npm run test:run
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/NaturalLanguageInput.jsx src/components/NaturalLanguageInput.test.jsx src/App.jsx src/components/ResultsList.jsx
git commit -m "feat: wire useSimplifier through ResultsList; lift modelKey + userDescription to App"
```

---

## Task 9: Browser smoke test

**Files:** none modified.

This task is verification only — no commit. Run through the user flows end-to-end against both models.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Smoke test with Gemma (default)**

Open `http://localhost:5173/iris/`. Verify:
- Open the NLP panel, consent, wait for model to load
- Type *"52 year old woman with triple negative breast cancer in NYC, did chemo already"*, click "Find trials →"
- Confirmation card shows extracted fields, form is prefilled
- Click "Search trials" — results appear from ClinicalTrials.gov
- The first 5 result cards show *"Generating plain-language summary…"* and incrementally render plain-language paragraphs and a "Why this might or might not fit you" paragraph
- Each completed card has a "Show clinical summary" `<details>` toggle that reveals the original `BriefSummary` and eligibility criteria
- Card 6 onwards shows a "Show in plain language" button; clicking it queues that card and it streams in
- Run a different search (or change condition) and confirm: the eager batch runs again for the new top 5 cards; previous simplifications are gone

- [ ] **Step 3: Smoke test with Qwen3**

Open `http://localhost:5173/iris/?model=qwen3` in a new tab (or after clearing the model cache to force re-download — the `?model=qwen3` toggle alone should switch). Repeat Step 2's flow and confirm:
- The active model line at the bottom of the NLP textarea reads "Model: Qwen3 1.7B"
- Plain-language sections render without `<think>` tokens leaking through (the worker's `enable_thinking: false` and the `parseExtraction` defense both apply, but only the former affects streaming output)
- Compare the simplification quality side-by-side against Gemma's runs

- [ ] **Step 4: Report any issues**

If the model produces malformed output, doesn't stream, or hits worker errors:
- Open browser devtools console
- Look for "task_error" messages or thrown exceptions
- Note the failing prompt and model
- Either fix in-place (small issues) or open a follow-up task and proceed

If all looks good, the implementation is complete.

---

## Notes for the Implementer

**Phase 2 must keep working.** After every task, mentally re-check the Phase 2 flow (NLP extract → form prefill → search). If a refactor broke it, revert and try a smaller change.

**The streaming UX is the visible quality bar.** A bad stream is a bad UX even if the final output is fine. Watch the dev-server browser tab during Task 9 carefully.

**The exemplars from Task 2 are load-bearing.** If output quality is poor in Task 9, the first thing to revisit is the exemplars — not the code. Get the user's review on them before you ship.

**No shortcuts on cache key.** The `modelKey` segment of the cache key is what makes the `?model=` toggle re-simplify cleanly when switching. If you skip it, switching models reads stale Gemma output from a Qwen3 page.

**Workers are stateful and the test stub is not.** Tests use a single `mockWorker` shared across tests via `beforeEach`. The shared-worker module-singleton from Task 6 also needs explicit reset (`terminateSharedWorker()` in `beforeEach`). Forgetting this causes flaky cross-test contamination.
