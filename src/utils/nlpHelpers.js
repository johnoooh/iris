export function buildPrompt(text) {
  return `Extract clinical trial search fields from the patient description below.
Return ONLY valid JSON. Omit any field you cannot determine.

{
  "condition": string,
  "location": string | null,
  "age": number | null,
  "sex": "MALE" | "FEMALE" | "ALL",
  "status": "RECRUITING" | "NOT_YET_RECRUITING" | "ALL" | null,
  "phases": ["PHASE1", "PHASE2", "PHASE3", "PHASE4"] | null
}

Rules:
- "condition" is the medical condition or disease name
- "location" is a city, state, zip code, or region if mentioned
- "sex" defaults to "ALL" unless patient gender is clearly stated
- "status" and "phases" only if explicitly mentioned (e.g. "Phase 2", "currently recruiting")
- Return ONLY the JSON object, no explanation

Patient description: "${text}"`
}

const VALID_SEX = ['MALE', 'FEMALE', 'ALL']
const VALID_STATUS = ['RECRUITING', 'NOT_YET_RECRUITING', 'ALL']
const VALID_PHASES = ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4']

export function parseExtraction(raw) {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return { condition: null }

  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return { condition: null }
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
  result.status = VALID_STATUS.includes(parsed.status) ? parsed.status : 'RECRUITING'
  result.phases = Array.isArray(parsed.phases)
    ? parsed.phases.filter(p => VALID_PHASES.includes(p))
    : []

  return result
}
