# Production NL-input test scenarios

Run each prompt against `http://localhost:4173/iris/` (Gemma 2 2B). For each, capture:

1. **Extracted fields** (the "Here's what I understood" card): condition / location / age / sex
2. **Search URL** (DevTools → Network → request to `clinicaltrials.gov`)
3. **Result count** (e.g. "23 trials found")
4. **Top trial's plain-language summary** — does it match the source? Does it invent details?
5. **Top trial's "Why this might or might not fit you"** — does it correctly reference the patient's situation?
6. **Latency** (rough — load+extract, then per-card simplification)

Paste the full set back as a single message and I'll evaluate.

---

## English (10 scenarios)

### E1 — Common cancer, simple
> I'm 58 years old with breast cancer in Boston

Expected: condition = breast cancer, location = Boston, age = 58, sex = ALL. Should yield many recruiting trials.

### E2 — Common chronic condition, dense city
> I'm a 52-year-old with type 2 diabetes looking for trials in Miami

Expected: condition = type 2 diabetes, location = Miami, age = 52. Sex should be ALL (the word "year-old" + "I'm" don't imply gender).

### E3 — Older, neuro, multi-clause
> I'm 74, I have early-stage Alzheimer's disease, and I live in Seattle. I'm interested in any new treatments.

Expected: condition = Alzheimer's (stage qualifier may or may not survive), location = Seattle, age = 74. Watch whether "early-stage" leaks into condition or gets dropped.

### E4 — Specific cancer subtype + treatment intent
> I'm 65 with metastatic melanoma. Looking for immunotherapy trials in Houston.

Expected: condition = metastatic melanoma (or melanoma + intervention=immunotherapy), location = Houston, age = 65. Watch how the model handles "immunotherapy" — currently the prompt only extracts condition/location/age/sex, no intervention field.

### E5 — Stage qualifier, specific city
> Stage 4 pancreatic cancer, age 67, Chicago

Expected: condition = pancreatic cancer (or "stage 4 pancreatic cancer"), location = Chicago, age = 67. Telegraphic phrasing — does it parse?

### E6 — Pediatric (parent-as-proxy)
> My 8-year-old daughter has acute lymphoblastic leukemia and we're in Philadelphia

Expected: condition = acute lymphoblastic leukemia, location = Philadelphia, age = 8, sex = FEMALE (justified — "daughter" is explicit). Watch whether the model puts age at 8 or accidentally extracts the parent.

### E7 — Rare disease, vague age
> 30s, neurofibromatosis type 1, NYC

Expected: condition = neurofibromatosis type 1 (or NF1), location = NYC. Age may come back null since "30s" isn't a single number — that's correct. Watch the search; rare-disease coverage may be sparse.

### E8 — Mental health
> I'm 28 and have treatment-resistant depression. I live near Denver.

Expected: condition = treatment-resistant depression (or depression), location = Denver, age = 28.

### E9 — Cardiovascular, multi-condition
> 67-year-old man with heart failure and atrial fibrillation in Atlanta

Expected: condition = heart failure (or atrial fibrillation, picking one), location = Atlanta, age = 67, sex = MALE. Both conditions are common; the search should still return relevant results because ClinicalTrials.gov fuzzy-matches.

### E10 — Edge case: very vague
> Looking for trials about kidney problems

Expected: condition = kidney disease (or similar), no location, no age. Watch whether the model invents an age or location.

---

## Spanish (10 scenarios)

These should produce **Spanish plain-language summaries** since we route Spanish input → `outputLanguage: "Spanish"` for the simplifier. Verify the simplification is actually in Spanish, not English.

### S1 — Common cancer, simple
> Tengo 58 años y cáncer de mama. Vivo en Boston.

Expected: condition = breast cancer (translated to English for the API), location = Boston, age = 58. Simplification → in Spanish.

### S2 — Type 2 diabetes
> Soy una mujer de 52 años con diabetes tipo 2 en Miami.

Expected: condition = type 2 diabetes, location = Miami, age = 52, sex = FEMALE (explicit "una mujer"). Simplification in Spanish.

### S3 — Alzheimer's, older
> Tengo 74 años, vivo en Seattle, y me diagnosticaron Alzheimer en etapa temprana.

Expected: condition = Alzheimer (translated), location = Seattle, age = 74.

### S4 — Metastatic melanoma
> Tengo 65 años y melanoma metastásico. Busco ensayos de inmunoterapia en Houston.

Expected: condition = metastatic melanoma, location = Houston, age = 65.

### S5 — Pancreatic, stage 4
> Cáncer de páncreas en etapa 4, 67 años, Chicago.

Expected: condition = pancreatic cancer, location = Chicago, age = 67.

### S6 — Pediatric (parent-as-proxy)
> Mi hija de 8 años tiene leucemia linfoblástica aguda. Estamos en Filadelfia.

Expected: condition = acute lymphoblastic leukemia, location = Philadelphia, age = 8, sex = FEMALE. Watch translation of "Filadelfia" → "Philadelphia" (per the prompt rule).

### S7 — Rare disease, vague age
> Treinta y pocos años, neurofibromatosis tipo 1, Nueva York.

Expected: condition = neurofibromatosis type 1, location = New York. Age likely null (vague phrasing).

### S8 — Depression
> Tengo 28 años y depresión resistente al tratamiento. Vivo cerca de Denver.

Expected: condition = treatment-resistant depression, location = Denver, age = 28.

### S9 — Cardiovascular
> Hombre de 67 años con insuficiencia cardíaca y fibrilación auricular en Atlanta.

Expected: condition = heart failure (or atrial fibrillation), location = Atlanta, age = 67, sex = MALE.

### S10 — Vague phrasing
> Busco ensayos sobre problemas renales.

Expected: condition = kidney disease, no location, no age. Should not invent details.

---

## What to watch for during evaluation

**Extraction failures:**
- Original-language phrase leaking into condition (e.g. "cáncer de mama" instead of "breast cancer") — would still kind-of-work because the API fuzzy-matches, but is a regression of our translation rule
- Sex hallucination on prompts that don't state gender
- Age set to a number that isn't in the prompt

**Simplification failures (Spanish prompts especially):**
- Falls back to English instead of Spanish
- Fabrications: invented age limits, autoimmune-disease exclusions, mistranslated medical terms (e.g. "CNS metastases" → "brain cancer")
- Trailing chatter ("Let me know if...", "I hope this helps")
- `<think></think>` artifacts (shouldn't happen with Gemma 2 — this is a Qwen3 issue — but worth checking)

**Search failures:**
- Geocode pinning to wrong location (e.g. "Filadelfia" → wrong Philadelphia, or NY state centroid)
- Empty results for prompts that should yield trials (E1, E2, E5, S1, S2, S5)
- The `aggFilters=sex:f` parameter shouldn't appear on prompts that say nothing about gender (E1–E5, E10, S1, S3, S4, S5, S7, S8, S10)

**Geocode tolerance test:**
- E7 says "NYC" — should resolve to New York City, not be rejected as state-level
- S7 says "Nueva York" — translation should yield "New York", which then geocodes correctly

**Latency check:**
- Extraction: should be <5s on Gemma 2 (we saw ~4–5s in earlier tests)
- Per-trial simplification: ~10–15s for first trial in stream, faster for subsequent (model warm)
