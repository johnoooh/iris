# IRIS MVP — Design Spec

**Date:** 2026-04-10
**Scope:** Phase 1 — Structured Search MVP

---

## Overview

IRIS is a fully static, privacy-first clinical trial discovery tool. It helps patients and advocates find relevant clinical trials via a clean interface to ClinicalTrials.gov's public API. Named for Iris Long (1934–2026), a pharmaceutical chemist and ACT-UP activist who dedicated her career to making clinical trial information accessible to the people who needed it most.

No data collection, no cookies, no tracking. The only network requests are a geocoding call to Nominatim and a structured query to ClinicalTrials.gov — nothing personal ever leaves the browser.

---

## Stack

- **React** + **Vite**
- **TanStack Query** — API state management, caching, pagination
- **Tailwind CSS** — styling (no component libraries)
- **Nominatim (OpenStreetMap)** — free geocoding, no API key required
- **Deployment:** GitHub Pages via GitHub Actions

---

## Visual Direction

**Warm Parchment palette:**
- Background: `#faf7f2`
- Surface/cards: `white`
- Accent/primary: `#7c6f5e`
- Muted text: `#7c6f5e`
- Body text: `#5a4e40`
- Headings: `#3a2e22`
- Borders: `#e0d5c5` / `#d4c9b8`
- Banner/footer bg: `#f0ebe2`

Warm and approachable — not clinical white/blue. Simple enough for a person in crisis to use without cognitive overload. Clearly non-commercial.

---

## Project Structure

```
iris/
├── public/
│   └── manifest.json              (PWA manifest)
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── DedicationBanner.jsx
│   │   ├── PrivacyStatement.jsx
│   │   ├── SearchForm.jsx
│   │   ├── NaturalLanguageInput.jsx   (disabled stub)
│   │   ├── ResultsList.jsx
│   │   ├── ResultCard.jsx
│   │   ├── PhaseExplainer.jsx
│   │   └── Footer.jsx
│   ├── hooks/
│   │   ├── useClinicalTrials.js       (TanStack Query, trials fetch)
│   │   └── useGeocode.js              (TanStack Query, Nominatim)
│   ├── utils/
│   │   └── apiHelpers.js              (param mapping, response parsing)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .github/
│   └── workflows/
│       └── deploy.yml                 (GitHub Actions, gh-pages deploy)
├── vite.config.js                     (base path set to repo name)
├── tailwind.config.js
└── package.json
```

---

## Page Layout

Single scrollable page, top to bottom:

1. **Header** — "IRIS" wordmark + "Clinical Trial Finder" subtitle
2. **DedicationBanner** — Iris Long (1934–2026) dedication in italics
3. **PrivacyStatement** — one-line privacy commitment
4. **SearchForm** — structured search fields
5. **NaturalLanguageInput** — collapsed stub with "Coming soon" badge
6. **ResultsList** — result count, sort control, cards, load-more
7. **Footer** — disclaimer, GitHub link, Iris Long/ACT-UP link

---

## Search Form Fields

All fields optional except Condition.

| Field | Type | API Param |
|---|---|---|
| Condition/Disease | text input | `query.cond` |
| Location | text input (city, state, or zip) | → geocoded to coords |
| Radius | select (25/50/100/200mi, anywhere) | `filter.geo` |
| Age | number input | `filter.age` |
| Gender | select (any, male, female) | `filter.sex` |
| Recruitment Status | select (recruiting, not yet recruiting, all) | `filter.overallStatus` |
| Phase | multi-select checkboxes (1, 2, 3, 4) | `filter.phase` |

The radius selector is hidden when no location is entered. Default radius is 50mi when location is provided.

---

## Data Flow

```
SearchForm (local state) → submit → searchParams object
    ↓
App passes searchParams to ResultsList
    ↓
useGeocode(location)
    → GET nominatim.openstreetmap.org/search?q={location}&format=json
    → returns { lat, lng }  (cached by location string)
    ↓
useClinicalTrials(searchParams, coords)
    → builds query URL via apiHelpers.buildQuery()
    → GET clinicaltrials.gov/api/v2/studies?...
    → returns { trials, totalCount, fetchNextPage, isFetching, error }
    (cached by searchParams + coords; paginated via pageToken)
    ↓
ResultsList → maps trials → ResultCard[]
```

**Key behaviour:** Search only fires on button click — no live queries while typing.

---

## API Details

**ClinicalTrials.gov v2**
- Endpoint: `https://clinicaltrials.gov/api/v2/studies`
- Pagination: `pageSize=10`, `pageToken` for subsequent pages
- Sort options: relevance, distance, most recently updated
- Return fields: `NCTId, BriefTitle, OfficialTitle, OverallStatus, Phase, BriefSummary, EligibilityCriteria, InterventionName, InterventionType, LocationCity, LocationState, LocationCountry, LocationFacility, CentralContactName, CentralContactPhone, CentralContactEMail, MinimumAge, MaximumAge, Sex, EnrollmentCount, StartDate, CompletionDate, LastUpdatePostDate`

**Nominatim geocoding**
- Endpoint: `https://nominatim.openstreetmap.org/search`
- Accepts: city name, "City, State", or zip code
- Requires `User-Agent` header identifying the app (e.g. `IRIS-ClinicalTrialFinder/1.0`)
- Rate limit: 1 req/sec (acceptable — only called once per unique location string, then cached)

---

## Result Card

Each card displays:
- Trial title (human-readable — strip excessive acronyms, normalize capitalization)
- Status badge (color-coded: green for RECRUITING, grey for others)
- Phase + plain-language tooltip via PhaseExplainer
- Nearest location + distance (when geocoding succeeded)
- Brief description of what's being studied
- Who can join — key eligibility summary (age range, gender, key inclusion points)
- Contact info (phone/email if available)
- "View full details on ClinicalTrials.gov →" link

---

## Error & Edge Case Handling

| Situation | Behaviour |
|---|---|
| API unreachable / 5xx | "We couldn't reach ClinicalTrials.gov right now. Please try again in a few minutes." |
| Rate limited (429) | Same message, no auto-retry |
| No results | Empty state with specific suggestions: remove location filter, broaden phases, rephrase condition |
| Geocoding failure | Fall back to `query.locn` with raw text. Subtle notice: "Couldn't pinpoint that location — showing results without distance filtering." |
| No location entered | Radius selector hidden; no geocoding call; no distance shown on cards |

---

## NaturalLanguageInput (Stub)

Visible but fully disabled. Shows:
- "Or, describe your situation in your own words" label
- Textarea (disabled)
- "Coming soon" badge
- Note: "This feature uses a small AI model that runs entirely in your browser. Your words are never sent to any server."

No WebLLM integration in Phase 1.

---

## Deployment

- **Host:** GitHub Pages
- **Build:** `npm run build` → `dist/`
- **Config:** `vite.config.js` sets `base: '/iris/'` (repo name)
- **CI:** GitHub Actions workflow on push to `main` — builds and deploys to `gh-pages` branch via `peaceiris/actions-gh-pages`
- **`.gitignore`** must include `.superpowers/`

---

## Hard Constraints

- No backend, no server-side code
- No localStorage for user data or search history
- No analytics, cookies, or tracking of any kind
- No WebLLM or AI integration in Phase 1
- Mobile-first, fully responsive
- Accessible: ARIA labels, keyboard navigation, semantic HTML, sufficient color contrast
