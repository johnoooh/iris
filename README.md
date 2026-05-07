# IRIS — A Privacy-First Clinical Trial Finder

A static web app that helps patients find relevant clinical trials from ClinicalTrials.gov. Search with a structured form or describe your situation in plain language and a small LLM running entirely in your browser fills in the form for you. Trials get rewritten into 8th-grade-reading-level summaries — also locally, also without sending anything to a server. Pin trials, compare them side-by-side, and print a PDF to bring to your oncologist.

**Live demo:** [johnoooh.github.io/iris](https://johnoooh.github.io/iris/)

---

## Why this exists

Most clinical-trial finders either bury you under jargon designed for principal investigators or trade your search history for "personalization." IRIS does neither. There is no backend, no account, no analytics, no `localStorage` for user data (one boolean for AI consent — that's it). The only network requests are:

1. ClinicalTrials.gov's public API (the search itself)
2. OpenStreetMap Nominatim (geocoding the location filter)
3. HuggingFace's WebLLM CDN (one-time model download, only if the user opts into the natural-language input)

You can verify this yourself: open DevTools, run the production build, watch the Network tab.

The project is named for [**Iris Long**](https://en.wikipedia.org/wiki/Iris_Long) (1933–2026), a pharmaceutical chemist who walked into an ACT-UP meeting in 1987, told the room they didn't know enough about the science to fight effectively, and offered to teach anyone who wanted to learn. She founded the Treatment and Data Committee and the AIDS Treatment Registry — work that helped turn AIDS from a death sentence into a manageable condition. Making clinical-trial information accessible to the people who need it most was her project. This one carries her name.

---

## What it does

### Structured search (always available, zero LLM required)

A form maps directly to ClinicalTrials.gov v2 API parameters: condition, location + radius, age, gender, phase, recruitment status. Submitting hits the API and renders trials in a two-pane triage layout (compact list on the left, detail pane on the right) that collapses to a tap-to-open bottom sheet on mobile.

### Natural-language input (opt-in, ~1.3 GB local model)

Type "I'm 58 years old with breast cancer in Boston" and a [Gemma 2 2B](https://huggingface.co/google/gemma-2-2b-it) model loaded via [WebLLM](https://webllm.mlc.ai/) extracts `condition`, `location`, `age`, and `sex`, then auto-fires the search — no second click required. Works in English and Spanish. The model runs in a Web Worker against your GPU; the prompt and the patient's text never leave the device. The textarea stays editable while the model downloads (~1.3 GB on first load, cached after); a submit during the download queues and auto-fires the moment the model becomes ready.

For other languages (Mandarin, Arabic, Cyrillic-script, etc.), extraction still works — the prompt explicitly tells the model to translate condition and location names to English so the API can be queried — but plain-language simplification falls back to the source English with a hint pointing the user at their browser's built-in translate. This is a deliberate tradeoff: small enough models to be downloadable on a phone can't reliably generate medical content in non-Latin scripts.

### Plain-language simplification (opt-in, same model)

For each trial the user opens in the detail pane, the model rewrites the brief summary and eligibility criteria into accessible language at an 8th-grade reading level, streaming tokens into the UI as it produces them. A two-tier `<details>` disclaimer below the summary sets honest expectations: small AI models can miss eligibility details, so the patient should verify with their care team before acting.

### Compare and print (no AI required)

Pin up to 3 trials with the checkbox on each row. The pin set survives search refinements (pinned trials are cached even if a refined search no longer returns them — surfaced as a "(N not in current results)" badge). Click `Compare →` for a side-by-side field grid: status, phase, intervention, location, eligibility, contact, etc. Click `Print this trial` from the detail pane or `Print all (N)` from the compare view to generate a PDF via the browser's native print dialog — no library, searchable text, native a11y. The printed output expands all collapsed sections, spells out URLs after each link, includes an NCT ID + generated-on timestamp for the receiving doctor, and lays out one trial per page with a summary index.

---

## What's interesting about it (technically)

### Eval-driven model selection

The choice of Gemma 2 2B as the default wasn't theoretical. The repo includes three dev-only test harnesses:

- `?test=nlp` — multilingual model evaluation across 20 prompts × N models, scoring extraction accuracy and latency.
- `?test=scenarios` — end-to-end production scenarios (extraction → geocode → ClinicalTrials.gov search → simplification) across 20 patient cases, emits a markdown report.
- `?test=classify` — a stage-1 binary classifier harness with 24 labeled trials, multilingual patient presets, translate-first toggle, production-realistic agreement metric, and copy-as-markdown output.

Findings that shaped the code:
- **Gemma 2 2B beats Qwen3 1.7B on Mandarin and Arabic** condition extraction; Qwen3 occasionally hallucinated wrong cancer types.
- **Qwen2.5-1.5B** edges Gemma slightly on binary classification accuracy (94% vs 93% in-scope) but its simplifier output is structurally unreliable on this prompt — kept as opt-in (`?model=qwen25`) for harness validation only.
- **Gemma 3 1B** fell into a degenerate `-` token loop on our schema-with-rules extraction prompt — too small at 1B params with q4f16 quantization. Removed.
- **Llama 3.2 3B** was catastrophic on classification (42% agreement, anchored on few-shot example demographics). Kept as opt-in (`?model=llama32`) for documentation but not recommended.
- The result: ship Gemma 2 2B for English + Spanish, point other-language users at browser translate, treat Qwen2.5 as a candidate worth fine-tuning. Honest > leaky.

### Failure-mode-anchored prompts

Every rule in the extraction and simplification prompts traces to a specific observed failure. Example:

```
- Do NOT infer sex from grammatical gender. Arabic, Spanish, French, etc.
  use masculine forms by default; this is grammar, not a statement
  about the speaker. "عمري 58 عامًا ولدي سرطان الثدي" → "ALL", not "MALE".
```

That rule exists because Gemma 2 2B was confidently returning `MALE` for Arabic patients with breast cancer. The full set of rules is in [`src/utils/nlpHelpers.js`](src/utils/nlpHelpers.js) and [`src/utils/simplifyHelpers.js`](src/utils/simplifyHelpers.js).

### Single-engine serialization

WebLLM's `MLCEngine` is not parallel-safe — concurrent `chat.completions.create()` calls clobber each other's state and produce `"Message error should not be 0"` failures. Both the simplifier (`useSimplifier`) and the classifier (`useClassifier`) serialize through their own promise chains so callers can fire-and-forget concurrently while the engine sees one task at a time. ([`src/hooks/useClassifier.js`](src/hooks/useClassifier.js))

### KV-cache management for browser LLMs

WebLLM's `MLCEngine` retains conversation state across `chat.completions.create` calls by default. Running 20 simplifications back-to-back produced **7× latency growth** as the KV cache accumulated. Calling `engine.resetChat()` before each task — these are independent one-shot tasks, no follow-up turns — restored constant per-task latency. ([`src/workers/nlp.worker.js`](src/workers/nlp.worker.js))

### Geocode rejection of area centroids

If the model extracts `"California"` as the location, OpenStreetMap returns the geographic centroid of the state, which lands deep in Sequoia National Forest. Pinning the trial search's `filter.geo` to a wilderness centroid silently produces zero results. The fix: read Nominatim's `addresstype` and reject `state`/`country`/`region`/`province` hits, so the search falls back to the text-based `query.locn` filter when the user names a region instead of a city. ([`src/hooks/useGeocode.js`](src/hooks/useGeocode.js))

### Tree-shaken dev test panels

The three test harnesses are full React UIs, but they ship zero bytes to production. The route check is gated on `import.meta.env.DEV` and the panels are loaded via `lazy(() => import(...))` only in that branch. Vite resolves the conditional at build time and removes the entire module graph from `dist/`. Verified by grepping the production bundle.

```js
const ClassificationHarness = import.meta.env.DEV
  ? lazy(() => import('./components/ClassificationHarness'))
  : null
```

### Native browser print for the doctor handoff

Compare-set and per-trial PDF export use `window.print()` plus a `@media print` stylesheet — no `jsPDF`, no `react-pdf`, no `html2canvas`. The resulting PDF has searchable text, respects screen-reader semantics, and adds zero bytes to the production bundle. The trade-off is layout constrained by the browser's print engine, which is fine for a clinical-trial summary. ([`src/styles/print.css`](src/styles/print.css))

### Streaming + queueing

`useSimplifier` runs a FIFO queue against the shared worker, streams token chunks back into per-trial state, and parses the structured output (delimited by `## What this study is testing` and `## Who can join`) on every chunk so the UI renders progressively. Reasoning models (Qwen3) emit `<think>...</think>` blocks that the parser strips before applying the section delimiter.

---

## Architecture

```
SearchForm  ──┐
              │  searchParams
NaturalLang ──┴──►  ResultsList ──►  useClinicalTrials  ──►  ClinicalTrials.gov API
   ▲                  │   │
   │                  │   └──►  useClassifier  (opt-in, gated, harness-only today)
   │                  │
   │                  ▼
   └─── prefill ──  useSimplifier ──►  Web Worker (WebLLM)
        fields                          │
                                        └──►  Gemma 2 2B (default) / Qwen3 1.7B
                                              / Qwen2.5-1.5B / Llama 3.2 3B (opt-in)
useNLP ────────────────────────────────►

App  ──►  compareSet + pinnedTrials cache  ──►  CompareView at #/compare
                                                  │
                                                  └──►  window.print() + print.css
```

- **Layer 1** — structured search (always works, zero LLM dependency)
- **Layer 2** — natural-language input opt-in, populates Layer 1's form, auto-fires the search
- **Layer 3** — plain-language simplification opt-in, runs against the selected trial in Layer 1's results
- **Layer 4** — compare + print, no LLM dependency

The single Web Worker owns one MLCEngine. `useNLP`, `useSimplifier`, and `useClassifier` all attach listeners to it; the worker serializes message handling and each hook chains its own outbound requests so the engine sees one task at a time.

---

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173/iris/  (port pinned via strictPort)
npm run build        # static build → dist/
npm run preview      # preview the production build
npm run test:run     # 197 tests
```

Dev-only test harnesses (live in DEV bundle only):

- `http://localhost:5173/iris/?test=nlp` — multilingual NLP extraction evaluation
- `http://localhost:5173/iris/?test=scenarios` — end-to-end scenario runner
- `http://localhost:5173/iris/?test=classify` — stage-1 binary classifier harness with multilingual patient presets

Append `&model=qwen25`, `&model=llama32`, or `&model=qwen3` to any of those URLs (or to the main app) to swap the active LLM. Models load on first opt-in and persist in the browser's WebLLM cache (keyed by origin).

---

## Tech stack

| | |
|---|---|
| Framework | React 19 + Vite |
| Styling | Tailwind |
| Data | TanStack Query + ClinicalTrials.gov v2 API |
| Geocoding | OpenStreetMap Nominatim |
| LLM runtime | [@mlc-ai/web-llm](https://webllm.mlc.ai/) 0.2.83 (WebGPU) |
| Models | Gemma 2 2B (default, ~1.3 GB) · Qwen3 1.7B (~1.1 GB) · Qwen2.5-1.5B (~900 MB) · Llama 3.2 3B (~1.9 GB) — all opt-in via `?model=` |
| Tests | Vitest (197 tests, 15 files) |
| CI | GitHub Actions: `npm ci → lint → test → build` on every PR to main |
| Deploy | Static build to GitHub Pages |

**Bundle:** main JS 91 KB gzip · LLM worker 1.5 MB gzip (lazy, only on opt-in)

---

## Privacy promise (verifiable)

The production bundle makes outbound requests to:

- `clinicaltrials.gov/api/v2/studies` — the trial search itself
- `clinicaltrials.gov/study/{nctId}` — only if the user clicks "View full details" (link, not fetch)
- `nominatim.openstreetmap.org/search` — geocoding the location filter
- `huggingface.co/mlc-ai/...` — one-time model download, only after explicit user consent

That's the complete list. No analytics, no telemetry, no error reporting, no fonts/CDNs, no service worker push. `localStorage` is used for exactly one boolean (`iris_nlp_enabled`): whether the user has consented to download the LLM, so they aren't re-prompted on every visit. The compare-pin set lives in memory only — refreshing clears it, by design.

---

## Roadmap

- [x] Phase 1 — Structured search MVP
- [x] Phase 2 — Natural-language input via local Gemma 2B (English + Spanish), auto-search after extraction
- [x] Phase 3 — Plain-language simplification with multilingual scoping; two-tier oncologist disclaimer
- [x] Phase 4 — Compare workflow (pin up to 3, side-by-side view) + browser-native PDF/print export for doctor handoff
- [ ] Phase 5 — Stage-1 binary classifier wired into results UI (validation harness already lives at `?test=classify`; in-app surfacing gated until "Best fit" sort lands)
- [ ] Phase 6 — Domain-specific LoRA fine-tune of Qwen2.5-1.5B to push classifier and simplifier accuracy past the stock-model ceiling (planning + dataset-curation docs in the project vault)

---

## Acknowledgements

[Iris Long](https://en.wikipedia.org/wiki/Iris_Long), for showing what it looks like to make complicated things accessible to the people they affect. Larry Kramer, the Treatment and Data Committee, and ACT-UP New York for the broader fight. The teams behind [WebLLM](https://webllm.mlc.ai/), [Gemma](https://ai.google.dev/gemma), and [ClinicalTrials.gov](https://clinicaltrials.gov/) for the open infrastructure that makes a no-backend version of this possible.
