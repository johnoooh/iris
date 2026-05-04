# IRIS Phase 3 — Plain-Language Result Simplification Design

**Date:** 2026-05-04
**Status:** Draft

---

## Overview

Phase 3 makes ClinicalTrials.gov result cards readable by patients in crisis. The same in-browser local LLM that powers Phase 2's natural-language input (Gemma 2 2B or Qwen3 1.7B via WebLLM) is reused to rewrite the dense `BriefSummary` and `EligibilityCriteria` fields into AHRQ 8th-grade-target prose. When the user has provided a free-text description via the Phase 2 NLP panel, an additional personalized "fit" assessment is generated per card.

No content leaves the browser. No simplifications are persisted across page loads — caching is in-memory only.

---

## Core Constraints

- **No backend** — inference is client-side via the existing WebLLM worker
- **No localStorage / sessionStorage / IndexedDB for simplified output** — even though the simplified text itself is generated from public trial data, *the fact that this user generated a summary for trial NCT12345* reveals their condition. In-memory only.
- **Same model loaded for Phase 2 serves Phase 3** — no second model download. The user's choice (`?model=gemma` vs `?model=qwen3`) applies to both
- **Single worker** — the existing `nlp.worker.js` is extended; no second worker is spawned
- **Graceful degradation** — when WebGPU is unavailable, simplification is silently absent and the original prose is shown unchanged

---

## What Gets Simplified

For every result card:

1. **`BriefSummary`** → a 2–3 sentence plain-language paragraph titled *"What this study is testing"*
2. **`EligibilityCriteria`** → a short prose section titled *"Who can join"* covering the highest-impact inclusion/exclusion items in plain words

Both items are produced by a single model call per card (a "summarize" prompt; see Prompt Design).

For cards rendered when the user has entered an NLP description:

3. **Personalized fit assessment** → a short paragraph titled *"Why this might or might not fit you"* that compares the trial against the user's situation (description text + extracted fields)

Produced by a separate model call per card (an "assess_fit" prompt). Skipped when no NLP description exists.

---

## Trigger Behavior

**Eager: first 5 cards in the list.** When `ResultsList` renders a search result page, the first 5 cards (by list position, not viewport) have their summarize calls queued automatically. If an NLP description is available, fit calls are queued after the summarize batch finishes. List position keeps the implementation simple — no IntersectionObserver, no scroll wiring.

**On-demand: cards 6+.** Each later card shows a *"Show in plain language"* button. Clicking it queues that card's summarize call (and fit, if applicable) at the front of the queue.

**Pagination.** When the user clicks "Load more results," the next 5 newly-loaded cards are *not* auto-queued — they each show the on-demand button. Rationale: the user has already seen plain-language output above and can opt in for new cards individually.

---

## Display

Each card has three possible visual states:

1. **Pending** — the original `BriefSummary` is shown unchanged, with a small italic indicator: *"Generating plain-language summary…"*
2. **Streamed** — sections render incrementally as tokens arrive. The streaming indicator is replaced section-by-section. (See Streaming below.)
3. **Complete** — final state:

```
What this study is testing
<plain-language paragraph>

Who can join
<plain-language paragraph>

Why this might or might not fit you           ← only when NLP context exists
<plain-language paragraph>

▸ Show clinical summary                       ← collapsed by default
```

The original `BriefSummary` and `EligibilityCriteria` live inside the collapsed `<details>` block, lossless and one click away. This is essential — patients may want to share the original wording with their clinician, and the simplified prose is not authoritative.

When simplification fails (model error, parse failure, timeout), the card silently falls back to showing the original prose with an italic hint: *"Plain-language version unavailable for this trial."* No retry button — repeat failures with the same prompt are unlikely to succeed.

---

## Streaming

The summarize prompt is asked to return markdown with a hard delimiter, not JSON:

```
## What this study is testing
<paragraph>

## Who can join
<paragraph>
```

The hook splits the streaming token buffer on the `## Who can join` delimiter and renders each section's text as it grows. This avoids the "watching JSON paint character-by-character" UX while keeping a single round-trip. If the model never emits the delimiter (malformed output), the entire growing buffer renders under "What this study is testing" and the eligibility section falls back to the original prose with the failure hint.

The fit prompt returns a single paragraph — no delimiter parsing required, just stream-and-render.

WebLLM exposes streaming via the OpenAI-compatible chat completions API (`stream: true`); the worker emits one new message type — `chunk` — with each token batch. The hook accumulates chunks per-card and per-section.

---

## Prompt Design

Both prompts are **exemplar-anchored**: a hand-written example of the desired output is embedded in the prompt as a one-shot demonstration. Small models (1.7–2B parameters) imitate examples more reliably than they follow abstract style instructions.

Exemplars target **AHRQ plain-language guidelines** — 8th-grade reading level, short sentences, common words, jargon defined inline, active voice. The author drafts both exemplars; the user reviews before they ship.

### Summarize prompt (per card)

Input variables:
- `briefSummary` — the trial's `BriefSummary` field
- `eligibility` — the trial's `EligibilityCriteria` field

Output: markdown with the two-section structure shown above.

### Assess-fit prompt (per card, only when NLP context exists)

Input variables:
- `briefSummary`, `eligibility` — same as above
- `userDescription` — the free-text NLP input, when available
- `extractedFields` — the parsed `{ condition, location, age, sex, phases }` from `parseExtraction` (always available)

Output: a single 2–4 sentence paragraph that names one or two specific reasons the trial may or may not fit. Must explicitly disclaim uncertainty (the model is encouraged to say "based on what you described, this trial may be a fit because…" rather than "you should join this trial").

### Context budget — known risk

Exemplars add ~300 tokens per call. With Qwen3 1.7B's 4 K context window:
- Top 5 cards × 1 summarize call = 5 calls × ~600 input tokens (exemplar + trial fields) ≈ 3,000 tokens
- Top 5 cards × 1 fit call = 5 calls × ~700 input tokens ≈ 3,500 tokens

Each call is independent (no conversation history reuse), so the per-call context fits comfortably. Risk is *latency cost* of all those input tokens being processed serially. Fallback if measurable latency hurts: drop to instruction-only prompts (no exemplar) or shorten the exemplars.

---

## Architecture

### New: `src/hooks/useSimplifier.js`

A hook that owns:
- An in-memory `Map<NCTId, CardSimplificationState>` — current simplification state per trial
- A FIFO queue of pending `(NCTId, promptType, inputs)` tasks
- A reference to the same single worker used by `useNLP`

Public API:

```js
const {
  states,                    // Map<NCTId, { summary, eligibility, fit, status, error }>
  enqueueSummarize(trial),   // adds summarize task; no-op if already cached
  enqueueAssessFit(trial),   // adds fit task; no-op if already cached or no NLP context
  cancelPending(),           // drains queue; in-flight task is allowed to finish
  resetCache(),              // clears states map (called on search change)
} = useSimplifier({ userDescription, extractedFields, modelKey })
```

`states` updates incrementally as chunks stream in — components subscribed to the map re-render section-by-section.

`modelKey` is the resolved key from `nlpModels.js` (`'gemma'` or `'qwen3'`), passed down from `App` so the hook and `NaturalLanguageInput` agree on which model is loaded.

### Worker protocol additions

New message types:

```
IN  { type: 'summarize',  taskId, briefSummary, eligibility }
IN  { type: 'assess_fit', taskId, briefSummary, eligibility, userDescription, extractedFields }
OUT { type: 'chunk',      taskId, text, section? }   // section: 'summary' | 'eligibility' | 'fit'
OUT { type: 'task_done',  taskId }
OUT { type: 'task_error', taskId, message }
```

`taskId` is a UUID generated by the hook. The worker echoes it on every message so the hook can route chunks to the correct card. The worker maintains its existing FIFO behavior (one task at a time); the hook is responsible for queueing.

The existing `extract` message type for Phase 2 is unchanged. All new types coexist.

### Worker shares one MLCEngine instance

The single loaded model serves all three prompt types. No model-default change in this phase — `?model=qwen3` continues to opt into Qwen3 for both extraction and simplification.

### `ResultsList` orchestration

```jsx
const simplifier = useSimplifier({ userDescription, extractedFields, modelKey })

useEffect(() => {
  // New search → drop queue, wipe cache, then queue eager batch for first 5 cards
  simplifier.cancelPending()
  simplifier.resetCache()

  const first5 = allTrials.slice(0, 5)
  for (const t of first5) simplifier.enqueueSummarize(t)
  if (userDescription) for (const t of first5) simplifier.enqueueAssessFit(t)
}, [searchParams])
```

`ResultCard` receives the per-trial simplification state via props (looked up by NCT ID) and renders accordingly.

### Cancellation semantics

`cancelPending()` clears the queue but does *not* terminate the in-flight generation — WebLLM doesn't expose cheap mid-stream cancellation. The in-flight task completes normally and its result is dropped at the hook level (the new search has already cleared `states`).

---

## Caching

In-memory `Map` keyed by `${nctId}:${promptType}:${modelKey}`. Lives for the React component tree's lifetime. Cleared when:
- The user navigates away or reloads (browser does this automatically)
- A new search runs — `searchParams` change triggers both `cancelPending()` (drops the queue) *and* a full reset of the simplifications map. The old trials are gone from the result list, so their cached simplifications are no longer reachable

Same-search re-renders (e.g., filter toggles that don't change `searchParams`) hit the cache. Pagination *adds* to the map without invalidating prior entries — `searchParams` haven't changed, so prior simplifications are still valid.

No persistence layer in any storage API. If the user reloads, all simplifications are recomputed.

---

## Failure Modes

| Failure | Behavior |
|---|---|
| Worker error (general) | Card falls back to original prose + italic hint |
| Streaming stalls (model hang) | Hook applies a 60-second per-task watchdog; on timeout, cancels mid-stream conceptually (worker still finishes), card falls back |
| Markdown delimiter missing | Whatever streamed renders under "What this study is testing"; eligibility falls back to original prose with hint |
| User changes search mid-stream | New search clears the `states` map; in-flight task completes and result is discarded |
| WebGPU unavailable | Simplification is absent — cards render raw prose as in Phase 1, no error UI |
| Phase 2 model not yet loaded | "Show plain language" button is disabled with tooltip *"AI model still loading"* |

---

## What This Phase Does NOT Do

- Fine-tuned model (Phase 4)
- Multilingual support (Phase 5)
- Persistent caching across sessions
- Quality scoring or model comparison harness (a separate eval task)
- Per-prompt model selection (one loaded model serves all prompts)
- Streaming cancellation mid-token (WebLLM constraint)

---

## Open Questions for Implementation

These are tactical and will be resolved during planning, not now:

- Exact wording of the AHRQ-target exemplars (drafted by author, reviewed by user)
- Visual treatment of the streaming "skeleton" / partial-paragraph state
- Exact `<details>` open/close microinteractions
- Watchdog timeout duration (60 sec is a starting point; tune to model speed)

---

## Future Considerations (deferred)

- Model comparison harness — a developer-only page that runs both models against a fixed set of trials and surfaces the outputs side-by-side. Worth doing once Phase 3 ships, before deciding whether to switch the default model away from Gemma.
- Streaming cancellation — if WebLLM adds a clean abort API, revisit cancellation to free GPU sooner on search changes.
- Reading-level verification — automated readability scoring of model outputs as a regression check.
