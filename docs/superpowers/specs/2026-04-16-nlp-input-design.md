# IRIS Phase 2 — Natural Language Input Design

**Date:** 2026-04-16
**Status:** Approved

---

## Overview

Phase 2 enables patients to describe their situation in plain English instead of filling out the structured search form. A local AI model (Gemma 2 2B via WebLLM) runs entirely in the browser, extracts structured search fields from the free text, and pre-fills the form. No text leaves the user's device.

The existing `NaturalLanguageInput` stub (currently disabled with a "Coming soon" badge) is fully implemented in this phase.

---

## Core Constraints

- **No server** — inference runs entirely client-side via WebLLM + WebGPU
- **No data transmission** — the user's free text never leaves the browser
- **No analytics, no logging** — consistent with Phase 1 privacy promise
- **Graceful degradation** — feature is visibly disabled (not hidden) when WebGPU is unavailable

---

## Interaction Flow (5 States)

### State 1 — Collapsed (default)
Panel header shows "Or, describe your situation in your own words" with a "New" badge. Collapsed until clicked.

### State 2 — Consent screen (first time only)
On first expand, show a one-time consent screen:
- Explains the model runs locally (never sent to a server)
- States the download size (~1.3 GB) and browser requirements
- "Download & enable" button starts the download
- "Not now" dismisses back to collapsed

Consent is persisted in `localStorage` as a single boolean flag (`iris_nlp_enabled`). On subsequent visits, the panel goes directly to State 4 (ready) and re-initialises the already-cached model.

### State 3 — Downloading / initialising
After consent:
- Progress bar showing bytes downloaded and estimated time remaining
- Status text: "Downloading AI model for the first time…"
- Note that this only happens once

WebLLM streams progress events from the worker. On init (after download), status text changes to "Initialising model…" for ~3–5 seconds.

### State 4 — Ready
Active textarea with placeholder: *"e.g. 52-year-old woman in Brooklyn with triple negative breast cancer, already did chemo"*

Hint text below: "IRIS will extract condition, location, age, and other relevant details automatically."

"Find trials →" submit button.

### State 5 — Confirmation card + form pre-fill
After the model returns extracted fields:
- A confirmation card shows each extracted field as a labelled chip
- The structured search form (SearchForm) is pre-filled with those values — highlighted fields show which were auto-populated
- Edit hint: "Not right? Edit the form below or retype your description."
- The form does **not** auto-submit — the user must click "Search trials"
- If `condition` is missing after extraction, the card shows a warning: "I couldn't determine the condition — please fill it in"

### Fallback — WebGPU unavailable
Detected on component mount via `navigator.gpu`. Panel is expanded but the textarea is disabled. Badge changes from "New" to "Unavailable". Message: "This feature requires a WebGPU-capable browser: Chrome 113+, Edge 113+, or Safari 17.4+. Your current browser doesn't support it."

---

## Architecture

### New Files

**`src/workers/nlp.worker.js`**
- Dynamically imports `@mlc-ai/web-llm` (lazy — not in main bundle)
- Owns the `MLCEngine` singleton; keeps it alive between queries
- Listens for messages: `{ type: 'load' }` and `{ type: 'extract', text }`
- Posts back: `{ type: 'progress', ... }`, `{ type: 'ready' }`, `{ type: 'result', fields }`, `{ type: 'error', message }`

**`src/hooks/useNLP.js`**
- Creates the worker once on mount, tears it down on unmount
- Manages state machine: `idle → downloading → ready → extracting → ready`
- Exposes: `{ status, progress, extract(text), error }`
- Detects WebGPU support and exposes `webGPUSupported` boolean

**`src/utils/nlpHelpers.js`**
- `buildPrompt(text)` — constructs the extraction prompt for Gemma 2 2B
- `parseExtraction(raw)` — strips prose, parses JSON, validates field types, fills safe defaults
- Safe defaults: `sex: 'ALL'`, `status: 'RECRUITING'`, `phases: []`
- `condition` has no default — left null if missing (triggers warning in UI)

### Modified Files

**`src/components/NaturalLanguageInput.jsx`**
- Replaces the current disabled stub
- Uses `useNLP` hook for model state
- Fires `onExtract(fields)` callback when confirmation is ready
- Manages the 5 states internally

**`src/components/SearchForm.jsx`**
- Gains an optional `prefill` prop (object with any subset of form fields)
- A `useEffect` watches `prefill` and syncs it into internal state when it changes
- Highlighted fields (pre-filled by NLP) use a distinct input style until the user edits them

**`src/App.jsx`**
- Adds `prefill` state alongside existing `searchParams` state
- Passes `prefill` to `SearchForm` and `onExtract={fields => setPrefill(fields)}` to `NaturalLanguageInput`
- `prefill` does not trigger a search — the user still clicks "Search trials" in the form

---

## Prompt Design

Prompt sent to Gemma 2 2B (in `nlpHelpers.js`):

```
Extract clinical trial search fields from the patient description below.
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

Patient description: "{{text}}"
```

`parseExtraction` strips any text before `{` and after `}` before JSON parsing. On parse failure, returns whatever fields were successfully extracted and logs the raw output for debugging.

---

## Model

| Property | Value |
|---|---|
| Model | Gemma 2 2B (instruction-tuned) |
| Provider | `@mlc-ai/web-llm` |
| Download size | ~1.3 GB (cached in browser after first load) |
| Inference time | ~1–2 seconds on modern hardware |
| Runtime | WebGPU (Chrome 113+, Edge 113+, Safari 17.4+) |

---

## Error Handling

| Case | Behavior |
|---|---|
| WebGPU unavailable | `navigator.gpu` check on mount; panel disabled with browser requirement message |
| Download network failure | Progress bar shows error state; "Download failed — try again" retry button |
| Worker crash | `useNLP` catches error, resets to `idle`, shows inline error in panel |
| Malformed JSON from model | `parseExtraction` recovers partial fields; missing fields stay blank |
| `condition` missing | Confirmation card shows warning; form is pre-filled with partial fields but user must add condition |

---

## Testing

All tests use Vitest + React Testing Library. No test touches the real model or WebLLM.

- **`src/utils/nlpHelpers.test.js`** — unit tests for `buildPrompt` and `parseExtraction`: valid JSON, partial JSON, malformed output, each field type, safe defaults
- **`src/hooks/useNLP.test.js`** — worker mocked with `vi.mock`; tests for each state transition, progress events, error recovery, WebGPU detection
- **`src/components/NaturalLanguageInput.test.jsx`** — RTL tests for each visual state: WebGPU unavailable render, consent screen, downloading state, ready state (typing + submit), confirmation card with extracted fields, missing condition warning

---

## Out of Scope (Phase 2)

- Plain-language result simplification (Phase 3)
- Fine-tuned extraction model (Phase 4)
- Multilingual input (Phase 5)
- Saving or re-using previous NLP queries
