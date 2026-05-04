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
- "condition" is the medical condition or disease name
- "location" is a city, state, zip code, or region if mentioned
- "sex" defaults to "ALL" unless patient gender is clearly stated
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
