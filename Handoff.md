# IRIS — Claude Code handoff

Design exploration is settled. This document is the bridge from the Claude.ai prototypes to the live `johnoooh/iris` codebase. Hand it to Claude Code along with the three artifact files.

---

## What's settled

**Direction:** Triage two-pane layout (list + detail). Mobile collapses to list + tap-to-sheet.

**Visual system:** Evolved warm-parchment palette + new iris-violet accent. Source Serif 4 (display), Inter Tight (UI), JetBrains Mono (technical). Tokens live in `styles/tokens.css`.

**Locked tweak values from the prototype:**
- Accent: `iris` (the violet)
- Density: `comfy`
- List width: `400px`

**New patterns introduced:**
- **Fit meter** — three-bar visualization (Likely / May / Unclear fit) shown per row and per detail pane
- **Two-stage AI pipeline** — fast classify pass, then on-demand full simplification (still being validated, see harness)
- **Local-AI badge** — always-visible mono pill in header announcing on-device model
- **Compare** — pin up to 3 trials; sticky bar; compare-view page is later work
- **Streaming shimmer** — placeholder lines shimmer until tokens land, then fade in
- **Unified search** — NL + structured form become one input with a mode toggle

---

## Files to reference

| File | Role |
|---|---|
| `IRIS Triage.html` | Final chosen direction. Reference for layout, spacing, microcopy. |
| `styles/tokens.css` | Drop-in CSS variables. Colors, fonts, shadows, shimmer keyframes. |
| `shared/iris-shared.jsx` | Reference implementations of header, search bar, fit meter, status pill, streaming text, action row. **Translate to your stack** (vanilla JS / whatever the live app uses) — don't copy React if the app isn't React. |
| `Classification Harness.html` | Standalone rig for validating the two-stage classify before wiring it in. |

---

## Integration plan (recommended order)

### Phase 1 — Visual system (low risk, ship first)

1. **Add Google Fonts link** to `<head>`:
   ```html
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
   ```
2. **Drop in `styles/tokens.css`** as new variables alongside existing ones; gradually replace the old palette.
3. **Replace header markup** with the new dense header + privacy chip + local-AI badge.
4. **Demote dedication banner** to a footer or "About IRIS" disclosure. Don't lose it — it's part of the project's soul, just not above-the-fold task-blocking.
5. **Compress the privacy paragraph** into the on-device chip + an expandable details element with the long form.

Ship after Phase 1 — already a meaningful UX improvement, no logic changes.

### Phase 2 — Row format + accordion or two-pane

The current cards are full-width prose blocks. Swap for compact rows:

```
[ ☐ ]  Phase IIIb Study of Ribociclib + ET in Early Breast Cancer
        ▌▌▌ Likely fit · 0.1 mi · Phase 3
```

Two implementation paths — pick one based on engineering appetite:

- **(a) Accordion in place** — easier. Click a row, it expands inline with the detail content. Works at any width. No layout fork.
- **(b) Two-pane** — matches the prototype. CSS grid `grid-template-columns: 400px 1fr`, collapses to single-column under 820px (`@media` query + state-driven sheet on mobile).

Recommend **(a) for first pass**, **(b) when you're ready to invest in the layout fork.**

### Phase 3 — Two-stage classification

**Don't ship this until the harness validates it.** See [Classification harness](#classification-harness) below.

When ready:
1. After search returns trial list, immediately render rows with title/distance/phase only — no fit meter yet.
2. Kick off `classifyAll(trials, userDesc)` with concurrency 2–3.
3. As each verdict returns, update that row's fit meter in place.
4. Show `evaluating fit · 7 of 20` indicator in the toolbar while running.
5. Once stage 1 is complete, default sort flips to "Best fit"; collapse UNLIKELY trials under a `12 less likely matches` disclosure.
6. Stage 2 (full simplification) only fires for the currently-selected trial in the detail pane, or top N likely matches as the user scrolls.

### Phase 4 — Compare

1. `Set<nctId>` in memory, max size 3.
2. Checkbox on each row.
3. Sticky bar appears when set is non-empty: `[ 2 in compare ] [ Compare → ]`.
4. Compare view itself is later — start with a placeholder route.

### Phase 5 — Mobile polish

1. Bottom-sheet pattern: tap row → sheet slides up with full detail. Backdrop dismiss + close button + drag handle.
2. Sticky compare bar at bottom.
3. Compact search summary chip replaces the full search bar on mobile (tap to expand).

### Phase 6 — Persistence (optional, session-only)

1. `sessionStorage` only — no PII to disk, in keeping with the privacy story.
2. Save: search query, comparing set, currently-selected trial.
3. Clear on a "Start over" button.

---

## Classification harness

`Classification Harness.html` is a standalone page with a mocked `classifyOne()` that simulates 200–1500ms latency and ~85% parse success.

**To validate the real model:**

1. Open the harness.
2. Replace the body of `classifyOne()` with your live on-device call — the function signature is `(prompt, trial) => Promise<{ verdict, reason, raw, latencyMs }>`.
3. Run with the included fixture (6 trials, with expected verdicts).
4. Check the stats row: parse rate, avg latency, max latency, agreement with expected.

**Pass criteria for moving to Phase 3:**
- Parse rate ≥ 90% on 50+ real trials
- Avg latency < 1.5s per trial on a mid-range laptop
- Agreement ≥ 80% on a labeled held-out set
- No catastrophic UNLIKELY false-negatives (a viable trial ranked as UNLIKELY)

**If parse rate is low:** try constrained decoding, or tighten the prompt to demand a single token first (`Output a single token: LIKELY, POSSIBLE, or UNLIKELY. Then on a new line, one sentence of reasoning.`).

**If latency is high:** drop concurrency to 1 (avoid model thrashing on small WebGPU buffers), truncate eligibility more aggressively (1500 → 800 chars), or run only on the top 10 by simple keyword pre-filter.

---

## Things explicitly out of scope for this pass

- Compare view (3-up side-by-side) — deferred
- Account / login / save across sessions — deferred, conflicts with privacy story
- Server-side fallback for the model — not consistent with on-device promise
- Distance map view — nice-to-have, not on the critical path
- Question-prep checklist — separate feature, separate PRD

---

## Open questions for product

1. **Fit meter wording** — "Likely fit / May fit / Unclear fit" is the current draft. Does that read right, or do we want softer phrasing ("Worth a look / Maybe / Probably not")?
2. **UNLIKELY default behavior** — collapse them, or just sort to bottom? Risk of hiding viable trials if the model is wrong.
3. **Compare view** — which dimensions matter most? Probably: phase, distance, drug/intervention, eligibility deltas, contact info.
4. **Fit meter on mobile rows** — keep at full size or shrink to just the bars? Currently same component, both contexts.

---

## Microcopy already drafted

- Header sub: `clinical trial finder`
- On-device chip: `on-device only`
- Local-AI badge: `Gemma 2 2B · on-device`
- Mode toggle: `Describe in your words` / `Structured form`
- Mode toggle pill: `AI · on-device`
- Understood section: `understood:` (mono, lowercase)
- Section labels in detail: `What this study is testing`, `Who can join`
- Fit panel caption: `based on what you described`
- Toolbar count: `20 trials · near Boston · within 50 mi · recruiting`
- Sort options: `Best fit`, `Distance`, `Phase`, `Most recent`
- Compare bar (mobile): `**N** in compare` / `Compare →`
- Sheet handle: drag affordance only, no label
- Fit verdicts: `Likely fit`, `May fit`, `Unclear fit`
