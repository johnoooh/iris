export function buildPrompt(text) {
  return `Extract clinical trial search fields from the patient description below.
Return ONLY valid JSON. Omit any field you cannot determine.

{
  "condition": string,
  "location": string | null,
  "age": number | null,
  "sex": "MALE" | "FEMALE" | "ALL",
  "phases": ["PHASE1", "PHASE2", "PHASE3", "PHASE4"] | null
}

Rules:
- All output values MUST be in ENGLISH, even if the patient writes in another language. ClinicalTrials.gov is an English-only registry.
  - Translate EVERY word of the condition to standard English medical terminology — including adjectives. Multi-word phrases must be fully translated:
    - "cáncer de mama" → "breast cancer"
    - "diabetes tipo 2" → "type 2 diabetes"
    - "melanoma metastásico" → "metastatic melanoma" (NOT "melanoma metastásico")
    - "leucemia linfoblástica aguda" → "acute lymphoblastic leukemia"
    - "insuficiencia cardíaca" → "heart failure"
    - "depresión resistente al tratamiento" → "treatment-resistant depression"
  - Translate place names to their common English form (e.g. "Los Ángeles" → "Los Angeles", "Filadelfia" → "Philadelphia", "Nueva York" → "New York").
- "condition" must be a precise medical term, not the patient's casual phrasing.
  - Replace vague words like "problems", "issues", "trouble", "problemas" with the proper medical term using "disease" or "disorder":
    - "kidney problems" → "kidney disease"
    - "problemas renales" → "kidney disease"
    - "heart problems" → "heart disease"
    - "stomach issues" → "gastrointestinal disease"
    - "breathing trouble" → "respiratory disease"
  - ClinicalTrials.gov indexes formal disease names ("kidney disease", "renal failure"), not colloquial complaints ("kidney problems"). Using the casual word will return zero results.
- "location" must be a SPECIFIC place: a city, "City, State", or a zip code. Examples: "Los Angeles", "Boston, MA", "10024".
  - Do NOT use a whole U.S. state alone ("California"), country ("USA"), region ("the West Coast"), or vague phrase ("near me", "nearby", "or nearby").
  - If the patient mentions only a state or region with no specific city, set location to null.
  - If multiple cities are mentioned, pick the most specific one the patient names first.
  - Strip qualifiers like "or nearby", "area", "the", "near".
- "sex" must be "ALL" UNLESS the patient explicitly identifies their own gender in plain words ("I'm a woman", "soy hombre", "as a man", "I'm female"). When in doubt, ALWAYS return "ALL".
  - Do NOT infer sex from the condition. Breast cancer, prostate cancer, ovarian cancer, etc. do not imply the patient's sex — men get breast cancer too.
  - Do NOT infer sex from grammatical gender. Arabic, Spanish, French, etc. use masculine forms by default; this is grammar, not a statement about the speaker. "عمري 58 عامًا ولدي سرطان الثدي" → "ALL", not "MALE".
  - Do NOT guess. If the patient describes a condition without saying their gender, return "ALL".
- "phases" only if explicitly mentioned (e.g. "Phase 2 trial")
- Do NOT include a "status" field — recruitment status is handled separately.
- Return ONLY the JSON object, no explanation

Patient description: "${text.replace(/"/g, '\\"')}"`
}

const VALID_SEX = ['MALE', 'FEMALE', 'ALL']
const VALID_PHASES = ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4']

export function parseExtraction(raw) {
  // Status is intentionally not extracted from free text — Gemma 2B
  // hallucinates NOT_YET_RECRUITING from phrases like "did chemo already".
  // The form's RECRUITING default sticks unless the user changes it manually.
  const DEFAULTS = { condition: null, sex: 'ALL', phases: [] }

  // Reasoning models (Qwen3, etc.) may emit <think>…</think> blocks before
  // the JSON answer. The think block can contain its own braces, which
  // would mis-slice the JSON. Strip any complete or trailing think blocks.
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return { ...DEFAULTS }

  let parsed
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return { ...DEFAULTS }
  }

  const result = {}

  result.condition =
    typeof parsed.condition === 'string' && parsed.condition.trim()
      ? parsed.condition.trim()
      : null

  if (typeof parsed.location === 'string' && parsed.location.trim()) {
    result.location = parsed.location.trim()
  }

  if (typeof parsed.age === 'number' && parsed.age >= 1 && parsed.age <= 120) {
    result.age = parsed.age
  }

  result.sex = VALID_SEX.includes(parsed.sex) ? parsed.sex : 'ALL'
  result.phases = Array.isArray(parsed.phases)
    ? parsed.phases.filter(p => VALID_PHASES.includes(p))
    : []

  return result
}
