# shared/iris-shared.jsx — design reference, not source

Reference implementations from the original Claude.ai design exploration.
Components in this file (`IrisHeader`, `IrisSearchBar`, `LocalAIBadge`,
`FitMeter`, `StatusPill`, `ActionRow`, `StreamingText`, …) were ported into
the live React app under `src/components/` and `src/utils/` — the versions
here are kept verbatim so a future reader can compare implementations
against the original prototype.

**Do not import from this file in `src/`.** It runs against a Babel-standalone
environment in `IRIS Triage.html` and uses inline-style patterns the live
app intentionally moved away from (the live app uses Tailwind utility
classes on top of CSS custom properties from `styles/tokens.css`).

If you're trying to "fix" or "consolidate" this file: stop. Edit the live
component under `src/components/` instead. The existence of this file is
documentation, not duplication.
