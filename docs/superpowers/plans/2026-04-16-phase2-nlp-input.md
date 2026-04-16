# Phase 2: NLP Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled `NaturalLanguageInput` stub with a fully working local-AI feature that extracts structured search fields from free-text patient descriptions using Gemma 2 2B via WebLLM, running entirely in the browser.

**Architecture:** A Web Worker owns the `MLCEngine` singleton and handles all WebLLM communication. A `useNLP` hook manages the worker lifecycle and exposes a simple state machine (`idle → downloading → ready → extracting → ready`). `NaturalLanguageInput` drives the 5-state UI and fires `onExtract(fields)` after the user confirms the parsed result. `SearchForm` gains a `prefill` prop that syncs extracted fields into its internal state.

**Tech Stack:** React 18, Vite 5 (module workers via `new Worker(new URL(...))`), `@mlc-ai/web-llm`, Vitest, React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/utils/nlpHelpers.js` | Create | `buildPrompt(text)` → prompt string; `parseExtraction(raw)` → validated fields object |
| `src/utils/nlpHelpers.test.js` | Create | Unit tests for both pure functions — no model, no worker |
| `src/workers/nlp.worker.js` | Create | Loads WebLLM dynamically, owns `MLCEngine`, handles `load`/`extract` messages |
| `src/hooks/useNLP.js` | Create | Worker lifecycle, state machine, `load()` + `extract(text)` API, WebGPU detection |
| `src/hooks/useNLP.test.js` | Create | Worker mocked with `vi.stubGlobal`; tests every state transition |
| `src/components/NaturalLanguageInput.jsx` | Replace | Full 5-state implementation; fires `onExtract(fields)` |
| `src/components/NaturalLanguageInput.test.jsx` | Create | RTL tests for every visual state |
| `src/components/SearchForm.jsx` | Modify | Add optional `prefill` prop + `useEffect` sync + highlight style for pre-filled fields |
| `src/components/SearchForm.test.jsx` | Modify | Add tests for prefill behaviour |
| `src/App.jsx` | Modify | Add `prefill` state, wire `onExtract` → `setPrefill`, pass `prefill` to `SearchForm` |

---

## Task 1: Install dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @mlc-ai/web-llm**

```bash
npm install @mlc-ai/web-llm
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@mlc-ai/web-llm'); console.log('ok')"
```
Expected: `ok`

> **Note on model ID:** WebLLM model IDs follow the pattern `{name}-{quant}-MLC`. Before Task 3, verify the exact Gemma 2 2B ID by running:
> ```bash
> node -e "const w = require('@mlc-ai/web-llm'); console.log(Object.keys(w.prebuiltAppConfig.model_list).filter(k => k.includes('gemma')))"
> ```
> The model ID used throughout this plan is `gemma-2-2b-it-q4f32_1-MLC` — update it in `nlp.worker.js` if the actual ID differs.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @mlc-ai/web-llm dependency"
```

---

## Task 2: `nlpHelpers` — `buildPrompt` + `parseExtraction`

**Files:**
- Create: `src/utils/nlpHelpers.js`
- Create: `src/utils/nlpHelpers.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/utils/nlpHelpers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildPrompt, parseExtraction } from './nlpHelpers'

describe('buildPrompt', () => {
  it('includes the patient text verbatim', () => {
    const prompt = buildPrompt('52yo woman with breast cancer in Brooklyn')
    expect(prompt).toContain('52yo woman with breast cancer in Brooklyn')
  })

  it('includes the JSON schema in the prompt', () => {
    const prompt = buildPrompt('test')
    expect(prompt).toContain('"condition"')
    expect(prompt).toContain('Return ONLY valid JSON')
  })
})

describe('parseExtraction', () => {
  it('parses a complete valid JSON response', () => {
    const raw = '{"condition":"breast cancer","location":"Brooklyn","age":52,"sex":"FEMALE","status":"RECRUITING","phases":["PHASE2"]}'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('breast cancer')
    expect(result.location).toBe('Brooklyn')
    expect(result.age).toBe(52)
    expect(result.sex).toBe('FEMALE')
    expect(result.status).toBe('RECRUITING')
    expect(result.phases).toEqual(['PHASE2'])
  })

  it('strips prose before and after the JSON object', () => {
    const raw = 'Sure! Here is the data:\n{"condition":"lung cancer"}\nI hope this helps.'
    const result = parseExtraction(raw)
    expect(result.condition).toBe('lung cancer')
  })

  it('returns condition: null when the string contains no JSON', () => {
    const result = parseExtraction('I cannot determine any fields from this.')
    expect(result.condition).toBeNull()
  })

  it('returns condition: null when JSON is malformed', () => {
    const result = parseExtraction('{condition: "cancer"')
    expect(result.condition).toBeNull()
  })

  it('returns condition: null when condition field is absent', () => {
    const result = parseExtraction('{"location":"Boston"}')
    expect(result.condition).toBeNull()
  })

  it('applies safe default sex: ALL when sex is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.sex).toBe('ALL')
  })

  it('applies safe default status: RECRUITING when status is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.status).toBe('RECRUITING')
  })

  it('applies safe default phases: [] when phases is missing', () => {
    const result = parseExtraction('{"condition":"cancer"}')
    expect(result.phases).toEqual([])
  })

  it('filters invalid phase values from the phases array', () => {
    const raw = '{"condition":"cancer","phases":["PHASE2","INVALID","PHASE3"]}'
    const result = parseExtraction(raw)
    expect(result.phases).toEqual(['PHASE2', 'PHASE3'])
  })

  it('ignores age values outside the 1–120 range', () => {
    const result = parseExtraction('{"condition":"cancer","age":999}')
    expect(result.age).toBeUndefined()
  })

  it('ignores invalid sex values and falls back to ALL', () => {
    const result = parseExtraction('{"condition":"cancer","sex":"UNKNOWN"}')
    expect(result.sex).toBe('ALL')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/utils/nlpHelpers.test.js
```
Expected: FAIL — `buildPrompt` not defined

- [ ] **Step 3: Implement `src/utils/nlpHelpers.js`**

```js
export function buildPrompt(text) {
  return `Extract clinical trial search fields from the patient description below.
Return ONLY valid JSON. Omit any field you cannot determine.

{
  "condition": string,
  "location": string | null,
  "age": number | null,
  "sex": "MALE" | "FEMALE" | "ALL",
  "status": "RECRUITING" | "NOT_YET_RECRUITING" | "ALL" | null,
  "phases": ["PHASE1", "PHASE2", "PHASE3", "PHASE4"] | null
}

Rules:
- "condition" is the medical condition or disease name
- "location" is a city, state, zip code, or region if mentioned
- "sex" defaults to "ALL" unless patient gender is clearly stated
- "status" and "phases" only if explicitly mentioned (e.g. "Phase 2", "currently recruiting")
- Return ONLY the JSON object, no explanation

Patient description: "${text}"`
}

const VALID_SEX = ['MALE', 'FEMALE', 'ALL']
const VALID_STATUS = ['RECRUITING', 'NOT_YET_RECRUITING', 'ALL']
const VALID_PHASES = ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4']

export function parseExtraction(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return { condition: null }

  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return { condition: null }
  }

  const result = {}

  result.condition =
    typeof parsed.condition === 'string' && parsed.condition.trim()
      ? parsed.condition.trim()
      : null

  if (typeof parsed.location === 'string' && parsed.location.trim()) {
    result.location = parsed.location.trim()
  }

  if (typeof parsed.age === 'number' && parsed.age >= 1 && parsed.age <= 120) {
    result.age = parsed.age
  }

  result.sex = VALID_SEX.includes(parsed.sex) ? parsed.sex : 'ALL'
  result.status = VALID_STATUS.includes(parsed.status) ? parsed.status : 'RECRUITING'
  result.phases = Array.isArray(parsed.phases)
    ? parsed.phases.filter(p => VALID_PHASES.includes(p))
    : []

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/utils/nlpHelpers.test.js
```
Expected: 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/nlpHelpers.js src/utils/nlpHelpers.test.js
git commit -m "feat: add nlpHelpers buildPrompt and parseExtraction utilities"
```

---

## Task 3: `nlp.worker.js`

**Files:**
- Create: `src/workers/nlp.worker.js`

No direct unit tests — the worker is tested indirectly via the mocked worker in Task 4.

- [ ] **Step 1: Create `src/workers/` directory and `nlp.worker.js`**

```js
// src/workers/nlp.worker.js
// Dynamically imported so @mlc-ai/web-llm stays out of the main bundle.
let engine = null

self.onmessage = async (event) => {
  const { type, text } = event.data

  if (type === 'load') {
    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      // Update the model ID below if the verified ID from Task 1 differs.
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
```

> The worker receives the **already-built prompt string** as `text` (built by `buildPrompt` in the hook before posting). It returns the raw model output string as `raw`; `parseExtraction` is called in the hook.

- [ ] **Step 2: Commit**

```bash
git add src/workers/nlp.worker.js
git commit -m "feat: add nlp Web Worker with WebLLM MLCEngine"
```

---

## Task 4: `useNLP` hook

**Files:**
- Create: `src/hooks/useNLP.js`
- Create: `src/hooks/useNLP.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/hooks/useNLP.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNLP } from './useNLP'

// A reusable mock worker whose onmessage/onerror are set by the hook after creation.
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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNLP — initial state', () => {
  it('starts in idle status', () => {
    const { result } = renderHook(() => useNLP())
    expect(result.current.status).toBe('idle')
  })

  it('reports webGPUSupported: false in jsdom (no navigator.gpu)', () => {
    const { result } = renderHook(() => useNLP())
    expect(result.current.webGPUSupported).toBe(false)
  })

  it('reports webGPUSupported: true when navigator.gpu exists', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result } = renderHook(() => useNLP())
    expect(result.current.webGPUSupported).toBe(true)
  })
})

describe('useNLP — load()', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  it('transitions to downloading when load() is called', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    expect(result.current.status).toBe('downloading')
  })

  it('posts { type: "load" } to the worker', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'load' })
  })

  it('transitions to ready when worker posts ready', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))
    expect(result.current.status).toBe('ready')
  })

  it('updates progress when worker posts progress', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'progress', progress: { progress: 0.5, text: 'Loading...' } } }))
    expect(result.current.progress).toEqual({ progress: 0.5, text: 'Loading...' })
  })

  it('transitions to error when worker posts error during load', () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'error', message: 'load failed' } }))
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('load failed')
  })
})

describe('useNLP — extract()', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  it('transitions to extracting and resolves with parsed fields', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    let fields
    const extractPromise = act(async () => {
      fields = await result.current.extract('breast cancer woman in Brooklyn aged 52')
    })

    act(() => mockWorker.onmessage({
      data: { type: 'result', raw: '{"condition":"breast cancer","location":"Brooklyn","age":52,"sex":"FEMALE"}' },
    }))

    await extractPromise
    expect(fields.condition).toBe('breast cancer')
    expect(fields.location).toBe('Brooklyn')
    expect(fields.age).toBe(52)
    expect(result.current.status).toBe('ready')
  })

  it('posts the built prompt to the worker', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    act(() => { result.current.extract('test input') })

    const call = mockWorker.postMessage.mock.calls.find(c => c[0].type === 'extract')
    expect(call[0].text).toContain('test input')
    expect(call[0].text).toContain('Return ONLY valid JSON')
  })

  it('returns to ready with null fields on worker error during extraction', async () => {
    const { result } = renderHook(() => useNLP())
    act(() => result.current.load())
    act(() => mockWorker.onmessage({ data: { type: 'ready' } }))

    let fields
    const extractPromise = act(async () => {
      fields = await result.current.extract('test')
    })

    act(() => mockWorker.onmessage({ data: { type: 'error', message: 'inference failed' } }))
    await extractPromise

    expect(fields).toBeNull()
    expect(result.current.status).toBe('ready')
  })
})

describe('useNLP — cleanup', () => {
  it('terminates the worker on unmount', () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const { result, unmount } = renderHook(() => useNLP())
    act(() => result.current.load())
    unmount()
    expect(mockWorker.terminate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/hooks/useNLP.test.js
```
Expected: FAIL — `useNLP` not defined

- [ ] **Step 3: Implement `src/hooks/useNLP.js`**

```js
import { useState, useEffect, useRef, useCallback } from 'react'
import { buildPrompt, parseExtraction } from '../utils/nlpHelpers'

export function useNLP() {
  const [status, setStatus] = useState('idle') // idle | downloading | ready | extracting | error
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [webGPUSupported] = useState(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator
  )
  const workerRef = useRef(null)
  const pendingRef = useRef(null) // { resolve, reject } for the in-flight extract()

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  function initWorker() {
    if (workerRef.current) return
    const worker = new Worker(new URL('../workers/nlp.worker.js', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event) => {
      const { type, progress: p, raw, message } = event.data

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
          // Error during extraction — return to ready with null result
          setStatus('ready')
          pendingRef.current.resolve(null)
          pendingRef.current = null
        } else {
          // Error during load
          setStatus('error')
          setError(message)
        }
      }
    }

    worker.onerror = (err) => {
      setStatus('error')
      setError(err.message)
      if (pendingRef.current) {
        pendingRef.current.resolve(null)
        pendingRef.current = null
      }
    }
  }

  function load() {
    if (!webGPUSupported) return
    initWorker()
    setStatus('downloading')
    workerRef.current.postMessage({ type: 'load' })
  }

  const extract = useCallback((text) => {
    return new Promise((resolve) => {
      setStatus('extracting')
      pendingRef.current = { resolve }
      workerRef.current.postMessage({ type: 'extract', text: buildPrompt(text) })
    })
  }, [])

  return { status, progress, error, webGPUSupported, load, extract }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/hooks/useNLP.test.js
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNLP.js src/hooks/useNLP.test.js
git commit -m "feat: add useNLP hook (Web Worker state machine, WebGPU detection)"
```

---

## Task 5: `SearchForm` — `prefill` prop

**Files:**
- Modify: `src/components/SearchForm.jsx`
- Modify: `src/components/SearchForm.test.jsx`

- [ ] **Step 1: Add failing tests**

Append to `src/components/SearchForm.test.jsx`:

```jsx
describe('SearchForm prefill', () => {
  it('pre-fills condition from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ condition: 'lung cancer' }} />)
    expect(screen.getByLabelText(/condition/i)).toHaveValue('lung cancer')
  })

  it('pre-fills location from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ location: 'Brooklyn' }} />)
    expect(screen.getByLabelText(/location/i)).toHaveValue('Brooklyn')
  })

  it('pre-fills age from prefill prop', () => {
    render(<SearchForm onSearch={vi.fn()} prefill={{ age: 52 }} />)
    expect(screen.getByLabelText(/age/i)).toHaveValue(52)
  })

  it('includes prefill condition in onSearch call', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<SearchForm onSearch={onSearch} prefill={{ condition: 'breast cancer' }} />)
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'breast cancer' })
    )
  })

  it('updates prefilled fields when prefill prop changes', () => {
    const { rerender } = render(
      <SearchForm onSearch={vi.fn()} prefill={{ condition: 'cancer' }} />
    )
    expect(screen.getByLabelText(/condition/i)).toHaveValue('cancer')
    rerender(<SearchForm onSearch={vi.fn()} prefill={{ condition: 'diabetes' }} />)
    expect(screen.getByLabelText(/condition/i)).toHaveValue('diabetes')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/components/SearchForm.test.jsx
```
Expected: 5 new failures — `prefill` prop not handled

- [ ] **Step 3: Modify `src/components/SearchForm.jsx`**

Add `useEffect` import and `prefill` prop. Replace the first line and component signature:

```jsx
import { useState, useEffect } from 'react'

const PHASES = [
  { value: 'PHASE1', label: 'Phase 1' },
  { value: 'PHASE2', label: 'Phase 2' },
  { value: 'PHASE3', label: 'Phase 3' },
  { value: 'PHASE4', label: 'Phase 4' },
]

const RADII = ['25', '50', '100', '200']

export default function SearchForm({ onSearch, prefill }) {
  const [condition, setCondition] = useState('')
  const [location, setLocation] = useState('')
  const [radius, setRadius] = useState('50')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('ALL')
  const [status, setStatus] = useState('RECRUITING')
  const [phases, setPhases] = useState([])
  const [prefillKeys, setPrefillKeys] = useState(new Set())

  useEffect(() => {
    if (!prefill) return
    const keys = new Set()
    if (prefill.condition) { setCondition(prefill.condition); keys.add('condition') }
    if (prefill.location) { setLocation(prefill.location); keys.add('location') }
    if (prefill.age != null) { setAge(String(prefill.age)); keys.add('age') }
    if (prefill.sex) { setSex(prefill.sex); keys.add('sex') }
    if (prefill.status) { setStatus(prefill.status); keys.add('status') }
    if (prefill.phases?.length) { setPhases(prefill.phases); keys.add('phases') }
    setPrefillKeys(keys)
  }, [prefill])

  function togglePhase(value) {
    setPhases(prev =>
      prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!condition.trim()) return
    onSearch({
      condition: condition.trim(),
      location: location.trim() || null,
      radius: location.trim() ? radius : null,
      age: age ? parseInt(age, 10) : null,
      sex,
      status,
      phases,
      sort: 'relevance',
    })
  }

  function inputClass(key) {
    const base = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-parchment-800'
    return prefillKeys.has(key)
      ? `${base} border-parchment-700 bg-parchment-100`
      : `${base} border-parchment-400 bg-white`
  }

  return (
    <form onSubmit={handleSubmit} className="bg-parchment-50 border-b border-parchment-300 px-6 py-6">
      <h2 className="text-base font-semibold text-parchment-950 mb-4">Find clinical trials</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div className="lg:col-span-2">
          <label htmlFor="condition" className="block text-xs font-medium text-parchment-900 mb-1">
            Condition or disease <span aria-hidden="true">*</span>
          </label>
          <input
            id="condition"
            type="text"
            required
            value={condition}
            onChange={e => { setCondition(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('condition'); return n }) }}
            placeholder="e.g. breast cancer"
            className={inputClass('condition')}
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-xs font-medium text-parchment-900 mb-1">
            Location
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={e => { setLocation(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('location'); return n }) }}
            placeholder="City, state, or zip"
            className={inputClass('location')}
          />
        </div>

        {location.trim() && (
          <div>
            <label htmlFor="radius" className="block text-xs font-medium text-parchment-900 mb-1">
              Radius
            </label>
            <select
              id="radius"
              value={radius}
              onChange={e => setRadius(e.target.value)}
              className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
            >
              {RADII.map(r => (
                <option key={r} value={r}>{r} mi</option>
              ))}
              <option value="anywhere">Anywhere</option>
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label htmlFor="age" className="block text-xs font-medium text-parchment-900 mb-1">
            Age
          </label>
          <input
            id="age"
            type="number"
            min={0}
            max={120}
            value={age}
            onChange={e => { setAge(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('age'); return n }) }}
            placeholder="e.g. 52"
            className={inputClass('age')}
          />
        </div>

        <div>
          <label htmlFor="sex" className="block text-xs font-medium text-parchment-900 mb-1">
            Gender
          </label>
          <select
            id="sex"
            value={sex}
            onChange={e => setSex(e.target.value)}
            className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
          >
            <option value="ALL">Any</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </div>

        <div>
          <label htmlFor="status" className="block text-xs font-medium text-parchment-900 mb-1">
            Recruitment status
          </label>
          <select
            id="status"
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
          >
            <option value="RECRUITING">Recruiting</option>
            <option value="NOT_YET_RECRUITING">Not yet recruiting</option>
            <option value="ALL">All</option>
          </select>
        </div>

        <div>
          <fieldset>
            <legend className="block text-xs font-medium text-parchment-900 mb-1">Phase</legend>
            <div className="flex flex-wrap gap-3">
              {PHASES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1 text-sm text-parchment-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={phases.includes(value)}
                    onChange={() => togglePhase(value)}
                    className="accent-parchment-800"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <button
        type="submit"
        className="bg-parchment-800 text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-parchment-950 focus:outline-none focus:ring-2 focus:ring-parchment-950 transition-colors"
      >
        Search trials
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/components/SearchForm.test.jsx
```
Expected: all 10 tests PASS (5 original + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/components/SearchForm.jsx src/components/SearchForm.test.jsx
git commit -m "feat: add prefill prop to SearchForm with highlight for NLP-populated fields"
```

---

## Task 6: `NaturalLanguageInput` — full implementation

**Files:**
- Replace: `src/components/NaturalLanguageInput.jsx`
- Create: `src/components/NaturalLanguageInput.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/NaturalLanguageInput.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NaturalLanguageInput from './NaturalLanguageInput'

// Mock useNLP so tests never touch the real worker or WebLLM
vi.mock('../hooks/useNLP', () => ({
  useNLP: vi.fn(),
}))

import { useNLP } from '../hooks/useNLP'

const baseHook = {
  status: 'idle',
  progress: null,
  error: null,
  webGPUSupported: true,
  load: vi.fn(),
  extract: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('NaturalLanguageInput — WebGPU unavailable', () => {
  it('shows Unavailable badge', () => {
    useNLP.mockReturnValue({ ...baseHook, webGPUSupported: false })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('shows browser requirement message', () => {
    useNLP.mockReturnValue({ ...baseHook, webGPUSupported: false })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByText(/WebGPU-capable browser/i)).toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — consent screen', () => {
  it('shows consent screen when no prior consent and WebGPU available', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'idle' })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByText(/One-time setup/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download & enable/i })).toBeInTheDocument()
  })

  it('calls load() and saves consent flag when user clicks Download', () => {
    const load = vi.fn()
    useNLP.mockReturnValue({ ...baseHook, load })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    fireEvent.click(screen.getByRole('button', { name: /Download & enable/i }))
    expect(load).toHaveBeenCalled()
    expect(localStorage.getItem('iris_nlp_enabled')).toBe('true')
  })

  it('collapses panel when user clicks Not now', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'idle' })
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    fireEvent.click(screen.getByRole('button', { name: /Not now/i }))
    expect(screen.queryByText(/One-time setup/i)).not.toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — downloading state', () => {
  it('shows progress bar when status is downloading', () => {
    useNLP.mockReturnValue({
      ...baseHook,
      status: 'downloading',
      progress: { progress: 0.62, text: 'Fetching model...' },
    })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByText(/Fetching model/i)).toBeInTheDocument()
  })
})

describe('NaturalLanguageInput — ready state', () => {
  it('shows enabled textarea when status is ready', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'ready' })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByRole('textbox', { name: /natural language search/i })).not.toBeDisabled()
  })

  it('calls extract() and onExtract() when user submits text', async () => {
    const user = userEvent.setup()
    const extract = vi.fn().mockResolvedValue({ condition: 'breast cancer', sex: 'FEMALE', age: 52 })
    const onExtract = vi.fn()
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={onExtract} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    await user.type(screen.getByRole('textbox', { name: /natural language search/i }), '52yo woman with breast cancer')
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await waitFor(() => expect(onExtract).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'breast cancer' })
    ))
  })
})

describe('NaturalLanguageInput — confirmation card', () => {
  it('shows extracted fields as chips after extraction', async () => {
    const extract = vi.fn().mockResolvedValue({
      condition: 'breast cancer', location: 'Brooklyn', age: 52, sex: 'FEMALE',
      status: 'RECRUITING', phases: [],
    })
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /natural language search/i }), {
      target: { value: '52yo woman with breast cancer in Brooklyn' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await screen.findByText(/Here's what I understood/i)
    expect(screen.getByText('breast cancer')).toBeInTheDocument()
    expect(screen.getByText('Brooklyn')).toBeInTheDocument()
  })

  it('shows missing condition warning when condition is null', async () => {
    const extract = vi.fn().mockResolvedValue({ condition: null, sex: 'ALL', status: 'RECRUITING', phases: [] })
    useNLP.mockReturnValue({ ...baseHook, status: 'ready', extract })
    localStorage.setItem('iris_nlp_enabled', 'true')

    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /natural language search/i }), {
      target: { value: 'something unclear' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Find trials/i }))

    await screen.findByText(/couldn't determine the condition/i)
  })
})

describe('NaturalLanguageInput — error state', () => {
  it('shows retry option when status is error', () => {
    useNLP.mockReturnValue({ ...baseHook, status: 'error', error: 'load failed' })
    localStorage.setItem('iris_nlp_enabled', 'true')
    render(<NaturalLanguageInput onExtract={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /describe your situation/i }))
    expect(screen.getByText(/try again/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/components/NaturalLanguageInput.test.jsx
```
Expected: FAIL — component doesn't implement these states yet

- [ ] **Step 3: Replace `src/components/NaturalLanguageInput.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useNLP } from '../hooks/useNLP'

const STORAGE_KEY = 'iris_nlp_enabled'

export default function NaturalLanguageInput({ onExtract }) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [extracted, setExtracted] = useState(null)
  const [consented, setConsented] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
  })

  const { status, progress, error, webGPUSupported, load, extract } = useNLP()

  // Auto-load model on expand if user previously consented
  useEffect(() => {
    if (consented && expanded && status === 'idle' && webGPUSupported) {
      load()
    }
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConsent() {
    try { localStorage.setItem(STORAGE_KEY, 'true') } catch { /* private browsing */ }
    setConsented(true)
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    const fields = await extract(text.trim())
    setExtracted(fields)
    if (fields) onExtract(fields)
  }

  function getProgressLabel() {
    if (!progress) return 'Downloading AI model…'
    if (progress.text) return progress.text
    return `Downloading AI model… ${Math.round((progress.progress ?? 0) * 100)}%`
  }

  const badgeLabel = !webGPUSupported ? 'Unavailable' : 'New'
  const badgeClass = !webGPUSupported
    ? 'bg-parchment-200 text-parchment-700'
    : 'bg-parchment-500 text-parchment-950'

  return (
    <div className="bg-parchment-100 border-b border-parchment-300 px-6 py-3">
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-parchment-800 hover:text-parchment-950"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>Or, describe your situation in your own words</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${badgeClass}`}>{badgeLabel}</span>
      </button>

      {expanded && (
        <div className="mt-3 max-w-xl">
          {/* WebGPU unavailable */}
          {!webGPUSupported && (
            <div className="bg-parchment-50 border border-parchment-300 rounded-md p-3">
              <p className="text-sm text-parchment-800">
                This feature requires a{' '}
                <strong className="text-parchment-950">WebGPU-capable browser</strong>: Chrome 113+,
                Edge 113+, or Safari 17.4+. Your current browser doesn&apos;t support it.
              </p>
            </div>
          )}

          {/* Consent screen */}
          {webGPUSupported && !consented && (
            <div className="bg-parchment-50 border border-parchment-300 rounded-md p-4">
              <h4 className="text-sm font-semibold text-parchment-950 mb-2">
                One-time setup: download AI model
              </h4>
              <p className="text-sm text-parchment-800 mb-2">
                This feature uses a small AI model (Gemma 2 2B) that runs entirely in your browser.
                Your words are <strong>never sent to any server</strong>.
              </p>
              <p className="text-xs text-parchment-700 mb-3">
                ⬇ ~1.3 GB · Downloads once, cached in your browser · Requires Chrome 113+, Edge
                113+, or Safari 17.4+
              </p>
              <button
                type="button"
                onClick={handleConsent}
                className="bg-parchment-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-parchment-950"
              >
                Download &amp; enable
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-2 text-sm text-parchment-700 border border-parchment-400 px-4 py-2 rounded-md hover:text-parchment-950"
              >
                Not now
              </button>
            </div>
          )}

          {/* Downloading / initialising */}
          {webGPUSupported && consented && status === 'downloading' && (
            <div>
              <p className="text-sm text-parchment-800 italic mb-2">{getProgressLabel()}</p>
              <div className="bg-parchment-300 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-parchment-800 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-parchment-700 mt-1">This only happens once.</p>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="bg-parchment-50 border border-parchment-400 rounded-md p-3">
              <p className="text-sm text-parchment-900">
                Something went wrong —{' '}
                <button type="button" onClick={handleConsent} className="underline">
                  try again
                </button>
              </p>
            </div>
          )}

          {/* Ready / extracting */}
          {webGPUSupported && consented && (status === 'ready' || status === 'extracting') && (
            <form onSubmit={handleSubmit}>
              <textarea
                rows={3}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. 52-year-old woman in Brooklyn with triple negative breast cancer, already did chemo"
                className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white text-parchment-950 resize-none focus:outline-none focus:ring-2 focus:ring-parchment-800"
                aria-label="Natural language search"
                disabled={status === 'extracting'}
              />
              <p className="mt-1 text-xs text-parchment-700">
                IRIS will extract condition, location, age, and other relevant details automatically.
              </p>
              <button
                type="submit"
                disabled={status === 'extracting' || !text.trim()}
                className="mt-2 bg-parchment-800 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-parchment-950 disabled:opacity-50"
              >
                {status === 'extracting' ? 'Extracting…' : 'Find trials →'}
              </button>
            </form>
          )}

          {/* Confirmation card */}
          {extracted && status === 'ready' && (
            <div className="mt-3 bg-white border-2 border-parchment-700 rounded-lg p-4">
              <h4 className="text-xs font-bold text-parchment-700 uppercase tracking-wide mb-3">
                Here&apos;s what I understood
              </h4>
              <div className="flex flex-wrap gap-2 mb-2">
                {extracted.condition && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Condition</span>
                    {extracted.condition}
                  </span>
                )}
                {extracted.location && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Location</span>
                    {extracted.location}
                  </span>
                )}
                {extracted.age != null && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Age</span>
                    {extracted.age}
                  </span>
                )}
                {extracted.sex && extracted.sex !== 'ALL' && (
                  <span className="bg-parchment-100 border border-parchment-300 rounded px-2 py-1 text-xs text-parchment-950">
                    <span className="text-parchment-500 mr-1 text-[10px] uppercase">Sex</span>
                    {extracted.sex.charAt(0) + extracted.sex.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
              {!extracted.condition && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠ I couldn&apos;t determine the condition — please fill it in below.
                </p>
              )}
              <p className="text-xs text-parchment-600 mt-2 italic">
                Not right? Edit the form below or retype your description.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/components/NaturalLanguageInput.test.jsx
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/NaturalLanguageInput.jsx src/components/NaturalLanguageInput.test.jsx
git commit -m "feat: implement NaturalLanguageInput with 5-state WebLLM flow"
```

---

## Task 7: Wire up `App.jsx` + full suite

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Read current `src/App.jsx`**

Current content at `src/App.jsx:1-37` — confirm it matches the Phase 1 version before editing.

- [ ] **Step 2: Replace `src/App.jsx`**

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

const queryClient = new QueryClient()

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)
  const [prefill, setPrefill] = useState(null)

  function handleExtract(fields) {
    setPrefill(fields)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <Header />
      <DedicationBanner />
      <PrivacyStatement />
      <main className="flex-1">
        <SearchForm onSearch={setSearchParams} prefill={prefill} />
        <NaturalLanguageInput onExtract={handleExtract} />
        {searchParams && <ResultsList searchParams={searchParams} />}
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

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```
Expected: all tests PASS, no failures

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire NaturalLanguageInput onExtract into App prefill state"
```

- [ ] **Step 5: Smoke test the dev server**

```bash
npm run dev
```

Open `http://localhost:5173/iris/`. Verify:
- NLP panel shows "New" badge and collapses/expands
- In a WebGPU-capable browser: expand shows the consent screen
- In a non-WebGPU browser (or devtools with WebGPU disabled): shows "Unavailable" badge and browser message
- Structured form still works independently (type a condition, submit, see results)
