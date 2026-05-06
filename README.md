# IRIS — A Privacy-First Clinical Trial Finder

A static web app that helps patients find relevant clinical trials from ClinicalTrials.gov. Search with a structured form or describe your situation in plain language and a small LLM running entirely in your browser fills in the form for you. Trials get rewritten into 8th-grade-reading-level summaries — also locally, also without sending anything to a server.

**Live demo:** [johnoooh.github.io/iris](https://johnoooh.github.io/iris/)

---

## Why this exists

Most clinical-trial finders either bury you under jargon designed for principal investigators or trade your search history for "personalization." IRIS does neither. There is no backend, no account, no analytics, no localStorage for user data. The only network requests are:

1. ClinicalTrials.gov's public API (the search itself)
2. OpenStreetMap Nominatim (geocoding the location filter)
3. HuggingFace's WebLLM CDN (one-time model download, only if the user opts into the natural-language input)

You can verify this yourself: open DevTools, run the production build, watch the Network tab.

The project is named for [**Iris Long**](https://en.wikipedia.org/wiki/Iris_Long) (1934–2026), a pharmaceutical chemist who walked into an ACT-UP meeting in 1987, told the room they didn't know enough about the science to fight effectively, and offered to teach anyone who wanted to learn. She founded the Treatment and Data Committee and the AIDS Treatment Registry — work that helped turn AIDS from a death sentence into a manageable condition. Making clinical-trial information accessible to the people who need it most was her project. This one carries her name.

---

## What it does

### Structured search (always available, zero LLM required)

A form maps directly to ClinicalTrials.gov v2 API parameters: condition, location + radius, age, gender, phase, recruitment status. Submitting hits the API and renders trials as cards with title, status, distance from your location, and contact information.

### Natural-language input (opt-in, ~1.3 GB local model)

Type "I'm 58 years old with breast cancer in Boston" and a [Gemma 2 2B](https://huggingface.co/google/gemma-2-2b-it) model loaded via [WebLLM](https://webllm.mlc.ai/) extracts `condition`, `location`, `age`, and `sex` into the structured form. Works in English and Spanish. The model runs in a Web Worker against your GPU; the prompt and the patient's text never leave the device.

For other languages (Mandarin, Arabic, Cyrillic-script, etc.), extraction still works — the model translates condition names to English so the API can be queried — but plain-language simplification falls back to the source English with a hint pointing the user at their browser's built-in translate. This is a deliberate tradeoff: small enough models to be downloadable on a phone can't reliably generate medical content in non-Latin scripts.

### Plain-language simplification (opt-in, same model)

For each trial in the result list, the model rewrites the brief summary and eligibility criteria into accessible language at an 8th-grade reading level. A second pass compares the patient's description against the trial's eligibility and writes a hedged "this might or might not fit you" note. Both stream into the UI as the model produces tokens.

---

## What's interesting about it (technically)

### Eval-driven model selection

The choice of Gemma 2 2B as the default wasn't theoretical. The repo includes a dev-only test harness (`?test=nlp`) that runs 20 multilingual prompts × N models and scores extraction accuracy plus latency. A second harness (`?test=scenarios`) runs end-to-end production scenarios — extraction → geocode → ClinicalTrials.gov search → simplification — across 20 patient cases and emits a markdown report.

Findings that shaped the code:
- **Gemma 2 2B beats Qwen3 1.7B on Mandarin and Arabic** condition extraction; Qwen3 occasionally hallucinated wrong cancer types.
- **Gemma 3 1B (newer, more multilingual)** turned out to fall into a degenerate `-` token loop on our schema-with-rules extraction prompt — too small at 1B params with q4f16 quantization. Removed.
- **Qwen3 4B would handle Arabic better** but is 2.5 GB and runtime-incompatible with most phones — not shippable for the actual target user.
- The result: ship English + Spanish (both verified accurate), point other-language users at browser translate. Honest > leaky.

### Failure-mode-anchored prompts

Every rule in the extraction and simplification prompts traces to a specific observed failure. Example:

```
- Do NOT infer sex from grammatical gender. Arabic, Spanish, French, etc.
  use masculine forms by default; this is grammar, not a statement
  about the speaker. "عمري 58 عامًا ولدي سرطان الثدي" → "ALL", not "MALE".
```

That rule exists because Gemma 2 2B was confidently returning `MALE` for Arabic patients with breast cancer. The full set of rules is in [`src/utils/nlpHelpers.js`](src/utils/nlpHelpers.js) and [`src/utils/simplifyHelpers.js`](src/utils/simplifyHelpers.js).

### KV-cache management for browser LLMs

WebLLM's `MLCEngine` retains conversation state across `chat.completions.create` calls by default. Running 20 simplifications back-to-back produced **7× latency growth** as the KV cache accumulated. Calling `engine.resetChat()` before each task — these are independent one-shot tasks, no follow-up turns — restored constant per-task latency. ([`src/workers/nlp.worker.js`](src/workers/nlp.worker.js))

### Geocode rejection of area centroids

If the model extracts `"California"` as the location, OpenStreetMap returns the geographic centroid of the state, which lands deep in Sequoia National Forest. Pinning the trial search's `filter.geo` to a wilderness centroid silently produces zero results. The fix: read Nominatim's `addresstype` and reject `state`/`country`/`region`/`province` hits, so the search falls back to the text-based `query.locn` filter when the user names a region instead of a city. ([`src/hooks/useGeocode.js`](src/hooks/useGeocode.js))

### Tree-shaken dev test panels

The two test harnesses are full React UIs, but they ship zero bytes to production. The route check is gated on `import.meta.env.DEV` and the panels are loaded via `lazy(() => import(...))` only in that branch. Vite resolves the conditional at build time and removes the entire module graph from `dist/`. Verified by grepping the production bundle.

```js
const NLPTestPanel = import.meta.env.DEV
  ? lazy(() => import('./components/NLPTestPanel'))
  : null
```

### Streaming + queueing

`useSimplifier` runs a FIFO queue against the shared worker, streams token chunks back into per-trial state, and parses the structured output (delimited by `## What this study is testing` and `## Who can join`) on every chunk so the UI renders progressively. Reasoning models (Qwen3) emit `<think>...</think>` blocks that the parser strips before applying the section delimiter.

---

## Architecture

```
SearchForm  ──┐
              │  searchParams
NaturalLang ──┴──►  ResultsList ──►  useClinicalTrials  ──►  ClinicalTrials.gov API
   ▲                  │
   │                  │  detected language → outputLanguage
   │                  ▼
   └─── prefill ──  useSimplifier ──►  Web Worker (WebLLM)
        fields                          │
                                        └──►  Gemma 2 2B / Qwen3 1.7B
useNLP ────────────────────────────────►
```

- **Layer 1** — structured search (always works, zero LLM dependency)
- **Layer 2** — natural-language input opt-in, populates Layer 1's form
- **Layer 3** — plain-language simplification opt-in, runs against Layer 1's results

The single Web Worker owns one MLCEngine. `useNLP` and `useSimplifier` both attach listeners to it; the worker serializes message handling so extraction and simplification can't race.

---

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173/iris/
npm run build        # static build → dist/
npm run preview      # preview the production build
npm run test:run     # 190 tests
```

Dev-only test harnesses:

- `http://localhost:5173/iris/?test=nlp` — multilingual model evaluation
- `http://localhost:5173/iris/?test=scenarios` — end-to-end scenario runner
- Append `&model=qwen3` to either to compare against Qwen3 1.7B

Models load on first opt-in and persist in the browser's WebLLM cache.

---

## Tech stack

| | |
|---|---|
| Framework | React 19 + Vite |
| Styling | Tailwind |
| Data | TanStack Query + ClinicalTrials.gov v2 API |
| Geocoding | OpenStreetMap Nominatim |
| LLM runtime | [@mlc-ai/web-llm](https://webllm.mlc.ai/) 0.2.83 (WebGPU) |
| Models | Gemma 2 2B (default, ~1.3 GB) · Qwen3 1.7B (option, ~1.1 GB) |
| Tests | Vitest (190 tests, 14 files) |
| Deploy | Static build to GitHub Pages |

**Bundle:** main JS 84 KB gzip · LLM worker 1.5 MB gzip (lazy, only on opt-in)
**Lighthouse:** 100 / 100 / 100 / 100 (Performance / A11y / Best Practices / SEO)

---

## Privacy promise (verifiable)

The production bundle makes outbound requests to:

- `clinicaltrials.gov/api/v2/studies` — the trial search itself
- `clinicaltrials.gov/study/{nctId}` — only if the user clicks "View full details" (link, not fetch)
- `nominatim.openstreetmap.org/search` — geocoding the location filter
- `huggingface.co/mlc-ai/...` — one-time model download, only after explicit user consent

That's the complete list. No analytics, no telemetry, no error reporting, no fonts/CDNs, no service worker push. `localStorage` is used for exactly one boolean: whether the user has consented to download the LLM (so they aren't re-prompted on every visit).

---

## Roadmap

- [x] Phase 1 — Structured search MVP
- [x] Phase 2 — Natural-language input via local Gemma 2B (English + Spanish)
- [x] Phase 3 — Plain-language simplification with multilingual scoping
- [ ] Phase 4 — Larger model when WebLLM ships Gemma 3 4B (broader language coverage)
- [ ] Phase 5 — Multilingual UI strings for non-Latin-script users

---

## Acknowledgements

[Iris Long](https://en.wikipedia.org/wiki/ACT_UP), for showing what it looks like to make complicated things accessible to the people they affect. Larry Kramer, the Treatment and Data Committee, and ACT-UP New York for the broader fight. The teams behind [WebLLM](https://webllm.mlc.ai/), [Gemma](https://ai.google.dev/gemma), and [ClinicalTrials.gov](https://clinicaltrials.gov/) for the open infrastructure that makes a no-backend version of this possible.
