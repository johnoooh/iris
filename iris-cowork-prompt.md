# Cowork Prompt: Build IRIS — Clinical Trial Finder MVP

## Context

Build a static, privacy-first clinical trial search web application called **IRIS**, named after Iris Long — a pharmaceutical chemist who worked at Sloan-Kettering and became a key ACT-UP activist in the 1980s. Her greatest contribution was translating complex clinical trial and drug information into language that patients and activists could understand. This tool continues that mission.

IRIS helps people find relevant clinical trials by providing a clean, accessible interface to ClinicalTrials.gov's public API, with optional AI-powered natural language input and plain-language result summaries — all running entirely in the user's browser with zero data collection.

## What to Build (Phase 1 — Structured Search MVP)

Build a React single-page application with the following:

### Landing Page
- Clean, minimal design. Warm but professional. Not clinical or cold.
- A brief dedication to Iris Long explaining who she was and why the tool is named after her. Something like: "Named for Iris Long (1934–), a pharmaceutical chemist and ACT-UP activist who dedicated her career to making clinical trial information accessible to the people who needed it most."
- A clear, prominent privacy statement in plain language: "Your information never leaves your device. IRIS collects no data, uses no cookies, requires no account, and has no tracking. The only network request is a structured search query to ClinicalTrials.gov's public database."
- Direct entry into the search interface — no signup, no onboarding, no friction.

### Search Interface (Layer 1 — No AI)
A structured form with the following fields:
- **Condition/Disease** — text input with common condition suggestions
- **Location** — text input (city, state, or zip code) with distance radius selector (25mi, 50mi, 100mi, 200mi, anywhere)
- **Age** — number input
- **Gender** — select (any, male, female)
- **Phase** — multi-select checkboxes (Phase 1, Phase 2, Phase 3, Phase 4, any)
- **Recruitment Status** — select (recruiting, not yet recruiting, all)
- **Search button**

All fields optional except condition. The form maps directly to ClinicalTrials.gov v2 API query parameters.

### Natural Language Input (Layer 2 — Future, stub only for now)
Below the structured form, include a collapsed/expandable section:
- "Or, describe your situation in your own words"
- A text area with placeholder text like: "Example: I'm a 52 year old woman in Brooklyn with triple negative breast cancer. I've already done chemotherapy but it came back."
- A note: "This feature uses a small AI model that runs entirely in your browser. Your words are never sent to any server."
- **For Phase 1, this section should be visible but disabled with a "Coming soon" badge.** Do not integrate WebLLM yet — just build the UI shell so the design accounts for it.

### Results Display
When results come back from ClinicalTrials.gov:
- Display as cards, not a table
- Each card shows:
  - **Trial title** — rewritten to be more human-readable if possible (strip excessive acronyms, capitalize properly)
  - **What it's studying** — brief intervention/treatment description
  - **Status** — recruiting, not yet recruiting, etc. with a colored badge
  - **Phase** — with a plain-language tooltip explaining what phases mean
  - **Location(s)** — nearest site to the user's specified location, with distance if possible
  - **Who can join** — a brief summary of key eligibility criteria (age range, gender, key inclusion points)
  - **Contact** — phone/email from the trial record if available
  - **Link** — "View full details on ClinicalTrials.gov" linking to the trial's page
- Pagination or infinite scroll for large result sets
- A count of total results found
- Sort options: relevance, distance, most recently updated

### Phase Explainer
Include a small, accessible reference that explains clinical trial phases in plain language:
- Phase 1: Testing safety and dosage in a small group
- Phase 2: Testing whether the treatment works and studying side effects
- Phase 3: Comparing the treatment to existing standard treatments in a large group
- Phase 4: Monitoring long-term safety after the treatment is approved

### Footer
- Link to the GitHub repository
- "IRIS is not medical advice. Always discuss clinical trial options with your healthcare provider."
- "IRIS is open source and collects no data."
- A link to learn more about Iris Long and ACT-UP

## Technical Requirements

### Stack
- **React** (Vite for build tooling)
- **No backend.** This is a fully static site.
- **No database, no cookies, no localStorage for user data, no analytics.**
- **ClinicalTrials.gov v2 API** — `https://clinicaltrials.gov/api/v2/studies` — all queries go directly from the browser. Handle CORS if needed (the API may support CORS directly; if not, note this as a deployment consideration).
- **Styling:** Tailwind CSS or a minimal CSS approach. No heavy component libraries. The design should feel human and approachable, not like a medical portal or a Silicon Valley SaaS app.
- **Responsive/mobile-first.** Many users will access this on phones.
- **Accessible:** Proper ARIA labels, keyboard navigation, semantic HTML, sufficient color contrast.
- PWA manifest for future offline support (include the manifest now, full offline support comes later).

### ClinicalTrials.gov API Integration
The v2 API endpoint is: `https://clinicaltrials.gov/api/v2/studies`

Key query parameters to use:
- `query.cond` — condition/disease
- `query.locn` — location
- `filter.overallStatus` — recruitment status (RECRUITING, NOT_YET_RECRUITING, etc.)
- `filter.phase` — phase filter
- `filter.sex` — sex/gender filter
- `filter.age` — age eligibility
- `pageSize` — results per page (default 10, max 100)
- `pageToken` — pagination
- `sort` — sort order
- `fields` — specify which fields to return to minimize response size

Return fields to request: NCTId, BriefTitle, OfficialTitle, OverallStatus, Phase, BriefSummary, EligibilityCriteria, InterventionName, InterventionType, LocationCity, LocationState, LocationCountry, LocationFacility, CentralContactName, CentralContactPhone, CentralContactEMail, MinimumAge, MaximumAge, Sex, EnrollmentCount, StartDate, CompletionDate, LastUpdatePostDate

### Error Handling
- If the API is unreachable, show a friendly message: "We couldn't reach ClinicalTrials.gov right now. This might be a temporary issue — please try again in a few minutes."
- If no results are found, suggest broadening search criteria with specific suggestions (remove location filter, try different condition phrasing, include all phases).
- Handle rate limiting gracefully.

### Project Structure
```
iris/
├── public/
│   ├── manifest.json
│   └── favicon (use an iris flower or similar)
├── src/
│   ├── components/
│   │   ├── SearchForm.jsx
│   │   ├── NaturalLanguageInput.jsx  (stub/disabled)
│   │   ├── ResultCard.jsx
│   │   ├── ResultsList.jsx
│   │   ├── PhaseExplainer.jsx
│   │   ├── PrivacyStatement.jsx
│   │   ├── Header.jsx
│   │   ├── Footer.jsx
│   │   └── DedicationBanner.jsx
│   ├── hooks/
│   │   └── useClinicalTrials.js (API query hook)
│   ├── utils/
│   │   └── apiHelpers.js (query parameter mapping, response parsing)
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## Design Direction

The visual design should feel:
- **Warm and trustworthy** — not clinical white with blue accents (that's every hospital portal). Consider warm neutrals, soft purples or teals, generous whitespace.
- **Simple and unintimidating** — a person in crisis should be able to use this without cognitive overload.
- **Text-forward** — the content is what matters, not decorative elements.
- **Clearly not commercial** — no "sign up" CTAs, no premium tiers, no upsells. This is a public good.

Inspiration: think of it as a tool Iris Long herself would have wanted to build — practical, no-nonsense, focused entirely on getting information to people who need it.

## README

The project README should include:
- What IRIS is and why it exists
- The dedication to Iris Long with historical context about her role in ACT-UP
- How the privacy architecture works (explained plainly)
- How to run locally (`npm install && npm run dev`)
- How to contribute
- The project roadmap (structured search → local LLM integration → fine-tuned model → multilingual support)
- License: MIT
- A note that this is not medical advice

## What NOT to Build Yet
- Do NOT integrate WebLLM or any AI model — just build the UI shell for it
- Do NOT add any server-side component
- Do NOT add authentication or user accounts
- Do NOT add analytics, tracking, or telemetry of any kind
- Do NOT use localStorage to persist user searches or preferences
