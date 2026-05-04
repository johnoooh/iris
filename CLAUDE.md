# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**IRIS** is a privacy-first clinical trial discovery tool — a fully static React SPA that helps patients find relevant clinical trials from ClinicalTrials.gov's public API. Named after Iris Long, an ACT-UP activist who made clinical trial information accessible to patients.

Core promise: no data collection, no backend, no cookies. The only network request is a structured query to ClinicalTrials.gov.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server
npm run build      # Build static site
npm run preview    # Preview production build
```

## Stack

- **React** + **Vite** (build tool)
- **Tailwind CSS** (styling — no heavy component libraries)
- No backend, no database, no auth, no analytics

## Architecture

### Three-Layer Design (Phase 1 MVP is Layer 1 only)

**Layer 1 — Structured Search (MVP, build now)**
- Form maps directly to ClinicalTrials.gov v2 API parameters
- Fields: Condition (required), Location + radius, Age, Gender, Phase (multi-select), Recruitment Status

**Layer 2 — Natural Language Input (stub only in Phase 1)**
- UI shell exists but is disabled with "Coming soon" badge
- Will eventually use local Gemma 2B via WebLLM — no server, never

**Layer 3 — Plain-Language Results (future)**
- Local LLM simplifies raw trial JSON into accessible summaries

### Data Flow

```
Search Form → Structured Query Params → ClinicalTrials.gov v2 API
→ Raw Trial JSON → Result Cards
```

The API (`https://clinicaltrials.gov/api/v2/studies`) is called directly from the browser. All processing is client-side.

### Key Files

- `src/hooks/useClinicalTrials.js` — API query logic, pagination, loading/error state
- `src/utils/apiHelpers.js` — query parameter mapping (form values → API params), response parsing
- `src/components/SearchForm.jsx` — structured search form
- `src/components/ResultCard.jsx` — single trial display card
- `src/components/NaturalLanguageInput.jsx` — disabled stub for Phase 2

### ClinicalTrials.gov API

Endpoint: `https://clinicaltrials.gov/api/v2/studies`

Key params: `query.cond`, `query.locn`, `filter.overallStatus`, `filter.phase`, `filter.sex`, `filter.age`, `pageSize` (max 100), `pageToken`, `sort`, `fields`

Return fields: `NCTId, BriefTitle, OfficialTitle, OverallStatus, Phase, BriefSummary, EligibilityCriteria, InterventionName, InterventionType, LocationCity, LocationState, LocationCountry, LocationFacility, CentralContactName, CentralContactPhone, CentralContactEMail, MinimumAge, MaximumAge, Sex, EnrollmentCount, StartDate, CompletionDate, LastUpdatePostDate`

## Design Principles

- Warm and approachable — not clinical white/blue (that's every hospital portal)
- Simple for a person in crisis to use without cognitive overload
- Clearly non-commercial — no sign-up CTAs, no upsells, no tiers

## Hard Constraints

- **No backend** — fully static site
- **No localStorage** for user data or search history
- **No analytics, no cookies, no tracking of any kind**
- **Do not integrate WebLLM** until Phase 2 is explicitly started
- **Accessible**: ARIA labels, keyboard navigation, semantic HTML, sufficient contrast
- **Mobile-first**: many users will access on phones

## Roadmap

1. **Phase 1 (now)**: Structured search MVP
2. **Phase 2**: Natural language input via local Gemma 2B (WebLLM)
3. **Phase 3**: Plain-language result simplification via local LLM
4. **Phase 4**: Fine-tuned model trained on synthetic data
5. **Phase 5**: Multilingual support
