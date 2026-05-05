# IRIS Phase 3 — Final Review Fixes

**Date:** 2026-05-05
**Status:** Open — fixes not yet landed
**Source:** Whole-implementation code review of Phase 3 (commits `c9679a5..7f29fc6`)

---

## Context

After all nine planned tasks of Phase 3 landed (12 commits, 157 tests green), an aggregate code review surfaced one Critical bug, six Important issues, and nine smaller suggestions. This document captures every finding so the work can be picked up cleanly later.

The review explicitly looked for:
- Cross-cutting concerns spanning multiple files
- Privacy posture violations
- Performance under load (eager batch of 5 cards × ~2 prompts × ~40 chunks)
- Incomplete error / silent-failure paths
- Test coverage gaps
- Phase 2 regressions from the shared-worker refactor
- Plan-vs-code drift

---

## Top 3 — recommended to land before any further feature work

### C1 — `handleConsent` doesn't pass `isThinking` (silently breaks Qwen3)

**Severity:** Critical
**File:** `src/components/NaturalLanguageInput.jsx:40`

`handleConsent` and the error-retry button (line 147 — `<button onClick={handleConsent}>`) call `load(model.id)` without the second arg. The auto-load `useEffect` at line 33 correctly passes `{ isThinking: model.isThinking }`. So:

- A user with `?model=qwen3` who clicks "Download & enable" the **first time** loads the worker with `isThinkingModel = false`.
- The worker then never sets `extra_body.enable_thinking = false` for any subsequent `extract`, `summarize`, or `assess_fit` call.
- Qwen3 emits `<think>…</think>` reasoning before the answer. The parser (`parseExtraction`) and `parseSummarizeStream` strip the tags after the fact, but tokens are wasted and streaming UX is degraded.
- A user who has **previously consented** in another session hits the auto-load path on next visit, which is correct — so the bug only fires on first consent and on retry-after-error.

**Fix:**

```js
function handleConsent() {
  try { localStorage.setItem(STORAGE_KEY, 'true') } catch { /* private browsing */ }
  setConsented(true)
  load(model.id, { isThinking: model.isThinking })
}
```

Or extract a single `loadWithModel()` helper that both `handleConsent` and the auto-load `useEffect` call.

**Test:** add a `NaturalLanguageInput.test.jsx` case asserting `useNLP.load` is called with `{ isThinking: true }` when the model is `qwen3` and the user clicks the consent button.

---

### I4 — `ResultCard` not memoized (≈10,000 wasted renders per simplification run)

**Severity:** Important — perf
**Files:** `src/hooks/useSimplifier.js:68-92`, `src/components/ResultsList.jsx:114-122`

Each streaming chunk runs `setStates(prev => new Map(prev))`. The `simplifier.states` reference changes per chunk. `ResultsList` maps over `allTrials` and passes `simplifier.states.get(trial.nctId)` to each `<ResultCard>`. None of those siblings are memoized.

5 cards × ~40 chunks × 10 sequential tasks ≈ **2,000 chunk arrivals × 5 cards = 10,000 component renders** during a fully loaded eager batch. Each card does cheap work, but on a low-end Chromebook this stutters visibly and burns battery.

**Fix:**

1. In `ResultsList.jsx`, wrap `handleRequestSimplify` in `useCallback`:
   ```jsx
   const handleRequestSimplify = useCallback((trial) => {
     simplifier.enqueueSummarize(trial)
     if (extractedFields) simplifier.enqueueAssessFit(trial)
   }, [simplifier, extractedFields])
   ```
2. In `ResultCard.jsx`, export the component wrapped in `React.memo`:
   ```jsx
   export default React.memo(ResultCard)
   ```
   Default shallow-prop comparison is sufficient because `simplification` is the only prop that mutates per chunk and its identity does change per chunk for the affected card.

Net effect: only the streaming card re-renders per chunk. Other 4 cards skip.

**Test:** consider adding a render-count assertion via a wrapper that increments a counter on each render — but this is a perf concern, not a correctness one, so a manual smoke test with React DevTools profiler is probably enough.

---

### I1 — `buildCacheKey` is dead code

**Severity:** Important — clarity
**Files:** `src/utils/simplifyHelpers.js:5`, `src/utils/simplifyHelpers.test.js:5-19`

The spec said cache keys would be `${nctId}:${promptType}:${modelKey}`. The actual implementation uses:

- `Map<nctId, { summarize, fit }>` for output state — no modelKey, no promptType
- `Map<\`${nctId}:${type}\`, status>` for the `statusRef` dedup gate — no modelKey

Neither uses `buildCacheKey`. The function is exported, has 3 tests, and is imported nowhere in production. Remains because `modelKey` is captured **once at App mount** via `useState(() => resolveModelKey(...))` and cannot change at runtime, so the modelKey segment of the key would never differentiate anything.

**Fix (preferred):** delete the function and its 3 tests. Update the spec doc to remove the `buildCacheKey` mention. Document that "modelKey is fixed at page load; runtime model switching requires reload."

**Fix (alternative):** if Phase 4 plans to support runtime model switching, wire `buildCacheKey` into the `statusRef` map and reset both on `modelKey` change. But that's speculative — defer until needed.

---

## Other Important findings (defer to follow-up commits)

### I2 — `modelKey` is in `useSimplifier` callback deps but never changes at runtime

**File:** `src/hooks/useSimplifier.js:169, 192`

`enqueueSummarize` and `enqueueAssessFit` both list `modelKey` in their dependency arrays. Harmless today but stale interface. Either:
- Drop `modelKey` from deps and add a comment noting it's page-lifetime constant
- Or commit to runtime model switching (would also require `statusRef` and `taskIndexRef` to reset on `modelKey` change — currently they don't)

Tied to I1: deciding the fate of `buildCacheKey` resolves this naturally.

### I3 — Eager-batch effect doesn't refire when two searches share the same first 5 NCT IDs

**File:** `src/components/ResultsList.jsx:39-50`

`eagerKey = allTrials.slice(0, 5).map(t => t.nctId).join(',')` is content-based, so two searches that happen to return the same first 5 trials don't trigger `cancelPending`/`resetCache`. In practice this is *correct* — same NCT IDs mean cached output is still valid. But the behavior is non-obvious.

**Fix:** add a one-line comment explaining the dep choice is intentional and that cached output is a pure function of `(nctId, modelKey, prompt content)`.

Edge case worth noting: if a trial's `BriefSummary` text changed server-side between two searches (very unlikely from CT.gov but possible), stale cached output would be served. Documented in the same comment.

### I5 — `enqueueSummarize` allows retry-after-error but no UI exposes it

**Files:** `src/hooks/useSimplifier.js:152-153`, `src/components/ResultCard.jsx:115`

After `task_error`, `statusRef` is set to `'error'`. The dedup gate's `existing === 'error'` branch implicitly *allows* a re-enqueue. But the on-demand button only renders when `simplification` is `undefined` — after error, `simplification` is defined (with `summarize.status === 'error'`), so the failure hint shows with no retry path.

Spec choice was "no retry button — repeat failures with the same prompt are unlikely to succeed." Consistent with the spec.

**Fix:** either add a tiny "Try again" link inline with the failure hint, or add a comment in `enqueueSummarize` documenting that the `'error'` branch is reachable only via a hypothetical future retry button.

### I6 — Bus-level worker error doesn't transition `useNLP` if not subscribed

**Files:** `src/workers/sharedNlpWorker.js:16-18`, `src/hooks/useSimplifier.js:35-39`, `src/hooks/useNLP.js:46-55`

`useNLP` lazily subscribes via `ensureSubscribed()` only on `load()`/`extract()` calls. If the user has the NLP panel collapsed and the worker crashes mid-Phase-3-stream:
- `useSimplifier` clears its in-flight task correctly
- `useNLP.status` doesn't transition to error — it stays at whatever it was (likely `idle` if the panel was never expanded, or `ready` if it was)
- Next time the user expands and tries to extract, they hit a confusing UI state because the engine is gone but `status` says `ready`

**Fix:** `useNLP.handleMessage` should treat a bus-level `{ type: 'error' }` (no `taskId`, no `pendingRef`) as a "model lost" signal — drop status back to `idle` and clear any state so the user can re-consent.

Rare in practice (worker crashes are usually OOM or WebGPU device lost). Real but low-priority.

### I7 — `attachListener` fan-out has no try/catch

**File:** `src/workers/sharedNlpWorker.js:22-25`

If a listener throws inside the fan-out loop in `getSharedWorker`'s `onmessage`, no `try/catch` protects the other listeners. One hook with a bug then silently breaks the other.

**Fix:** wrap the inner call:
```js
workerInstance.onmessage = (event) => {
  for (const fn of listeners) {
    try { fn(event) } catch (e) { console.error('shared worker listener failed', e) }
  }
}
```

Free defense in depth. ~3 lines.

---

## Suggestions (small polish; land opportunistically)

### S1 — Stale interface: `parseSummarizeStream` returns `complete` but `useSimplifier` ignores it

`parseSummarizeStream` returns `{ summary, eligibility, complete }`. Hook tracks completion via the worker's `task_done` message. Drop `complete` from the parser's return shape (and tests) for clarity.

### S2 — Duplicate import in `simplifyHelpers.test.js`

```js
import { buildCacheKey, parseSummarizeStream } from './simplifyHelpers'
import { buildSummarizePrompt, buildAssessFitPrompt } from './simplifyHelpers'
```

Merge into one import statement.

### S3 — `taskId` generator is a module-singleton mutable counter

`src/hooks/useSimplifier.js:12-13` — `let nextTaskId = 0`. Two consumers of `useSimplifier` (not currently a thing, but possible if a future surface adds inline simplification on a different page) would share IDs. Switch to `crypto.randomUUID()`.

### S4 — `useEffect` cleanup in `useSimplifier` doesn't drain in-flight task

If `ResultsList` unmounts mid-stream, the worker continues processing the in-flight task. Orphan messages are correctly dropped by `taskIndexRef.get(taskId)` returning `undefined`, but the GPU keeps working on now-abandoned output. For a single-page SPA where the only unmount is "user closed the tab," this doesn't matter. Add a comment so the next maintainer doesn't think it's a bug.

### S5 — Spec drift: pending state should show original prose + indicator

Spec said: *"Pending — the original BriefSummary is shown unchanged, with a small italic indicator: 'Generating plain-language summary…'"*

Implementation shows the empty plain-language section (with a single space) + the indicator. No original prose during pending.

The implementation is arguably better UX (no text shift when the first chunk arrives), so update the spec rather than the code.

### S6 — `ResultCard.test.jsx` has two `mockTrial` shapes

Two `describe` blocks define two slightly different fixtures (`eligibility.criteria` is `''` vs `'Adults 18+.'`). Consolidate into a single fixture or factory.

### S7 — Both exemplars are breast-cancer-themed

Working as designed (`REVIEW NOTES: edit freely`). Worth noting that prompt regressions may be hard to spot when the exemplar and the trial-under-test are both about breast cancer — model could pattern-match instead of generalize. Address when building the model-comparison harness mentioned in the spec.

### S8 — No regression test for Phase 2 retry-after-error

Commit `8f72f65` ("terminate and recreate worker on load() retry") fixed a real bug. After the shared-worker refactor, the retry path no longer terminates. Worth a manual smoke test: load → trigger an error → click "try again" — does the model still recover? If not, retry-after-error is broken in v1 (acceptable per the spec note that this is a known limitation, but should be confirmed and documented).

### S9 — Style mix: function declarations vs arrow consts inside `useSimplifier`

Mix of `function applyChunk(...) {}` and `const enqueueSummarize = useCallback(...)`. Pick one for inner functions. Not a blocker.

---

## Plan-vs-code drift summary

| Spec said | Code does | Verdict |
|---|---|---|
| Cache key includes `modelKey` | Cache key is just `nctId:type` | I1 — drop `buildCacheKey`, update spec |
| Worker accepts `{briefSummary, eligibility, ...}` and builds prompt | Worker accepts `{prompt}` pre-built by hook | Better — keeps worker dumb. Update spec. |
| `chunk` message has optional `section` field | No `section` field — section parsed in hook | Better — update spec |
| Pending state shows original prose + indicator | Pending shows empty plain-language section + indicator | S5 — update spec |
| 60-sec watchdog timer | Not implemented | Documented as "open question" in spec. Defer. |
| `cancelPending` doesn't terminate in-flight task | Matches | Good |

---

## Privacy posture (verified clean)

The reviewer ran `grep -r 'localStorage|sessionStorage|IndexedDB|cookie|fetch|XMLHttpRequest|sendBeacon'` across all Phase 3 files. **No Phase 3 file persists user data anywhere or makes outbound network calls outside the existing CT.gov + Nominatim + WebLLM model download paths.** The single `localStorage` write in `NaturalLanguageInput.jsx` is the pre-existing consent flag (`iris_nlp_enabled = 'true'`), not Phase 3 data.

In-memory `Map` cache wipes on page reload. The cache invalidates on every search change via `simplifier.resetCache()`. Nothing leaks between sessions.

---

## Suggested commit sequence

If picking this up later, the cleanest order is:

1. `fix: pass isThinking to useNLP.load from handleConsent and retry button` — addresses C1
2. `perf: memoize ResultCard and stabilize onRequestSimplify callback` — addresses I4
3. `chore: remove unused buildCacheKey export and its tests` — addresses I1
4. (optional) `chore: address Phase 3 review polish` — bundles I3 comment, I7 try/catch, S1 cleanup, S2 import merge

Top 3 are mechanical, ~15 minutes of total work, should not require any plan or spec changes.
