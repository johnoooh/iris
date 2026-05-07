// Stage-1 classification prompt + verdict parser.
// Shared between the harness (?test=classify) and the in-app
// classifyAll flow in ResultsList so the model sees the same prompt
// in both contexts. Keep the wording in sync with the validated
// harness baseline (Qwen2.5-1.5B → ~83% binary agreement, 0
// catastrophic UNLIKELY).

export const DEFAULT_CLASSIFY_PROMPT = `You decide whether a clinical trial is worth showing to a patient. Output one of two labels:

- LIKELY: the trial studies the patient's condition AND nothing in the eligibility clearly excludes the patient based on what they stated. Worth showing.
- UNLIKELY: the trial studies a different disease, OR the patient is clearly the wrong sex / age / population. Not worth showing.

Be inclusive on LIKELY: if the trial requires a subtype, biomarker, stage, or prior treatment the patient did NOT mention, still call it LIKELY — the patient or their doctor can verify. Only use UNLIKELY when the patient is clearly disqualified by something they DID state.

Examples (note: each example uses a DIFFERENT patient — focus on the reasoning, not the patient details):

Patient: "45-year-old woman with ovarian cancer"
Trial: PARP Inhibitor in BRCA-Mutated Ovarian Cancer (Eligibility: women with ovarian cancer and BRCA mutation)
Answer: LIKELY | matches ovarian cancer in a woman; BRCA status can be verified

Patient: "70-year-old man with type 2 diabetes"
Trial: Tamoxifen in Premenopausal Breast Cancer (Eligibility: premenopausal women with breast cancer)
Answer: UNLIKELY | trial is for breast cancer in women; patient has diabetes

Patient: "8-year-old child with asthma"
Trial: Adult Anti-Inflammatory for Asthma (Eligibility: adults 18+ with persistent asthma)
Answer: UNLIKELY | trial is for adults; patient is a child

Patient: "55-year-old man with hypertension"
Trial: Yoga Intervention for Adults with Chronic Conditions (Eligibility: adults 40-75 with any chronic condition)
Answer: LIKELY | adult with chronic condition matches the broad inclusion

Now classify:

Patient: {{user}}
Trial: {{title}}
Eligibility: {{eligibility}}

Answer (one line, format exactly "<LABEL> | <one short reason>"):`

export const ELIG_MAX_CHARS = 1500

export function buildClassifyPrompt(userDesc, trial, eligMax = ELIG_MAX_CHARS) {
  // Reuse the trial.eligibility (string) when present; fall back to the
  // structured eligibility.criteria field that useClinicalTrials emits.
  const elig = (
    typeof trial.eligibility === 'string'
      ? trial.eligibility
      : trial.eligibility?.criteria ?? ''
  ).slice(0, eligMax)
  const title = trial.title || trial.briefTitle || ''
  return DEFAULT_CLASSIFY_PROMPT
    .replace('{{user}}', userDesc ?? '')
    .replace('{{title}}', title)
    .replace('{{eligibility}}', elig)
}

// Parser still accepts POSSIBLE in case the model emits it (older prompts,
// instruction drift) — POSSIBLE is normalized to LIKELY since the binary
// product question is "show or hide".
export function parseVerdict(raw) {
  if (!raw || typeof raw !== 'string') return { verdict: 'PARSE_FAIL', reason: '(empty output)' }
  const m = raw.match(/^\s*(LIKELY|POSSIBLE|UNLIKELY)\s*[|:\-—]\s*(.+?)\s*$/im)
  if (m) {
    const v = m[1].toUpperCase()
    return { verdict: v === 'POSSIBLE' ? 'LIKELY' : v, reason: m[2].trim() }
  }
  const w = raw.match(/\b(LIKELY|POSSIBLE|UNLIKELY)\b/i)
  if (w) {
    const v = w[1].toUpperCase()
    return {
      verdict: v === 'POSSIBLE' ? 'LIKELY' : v,
      reason: raw.replace(w[0], '').replace(/^[\s|:\-—]+/, '').trim() || '(no reason)',
    }
  }
  return { verdict: 'PARSE_FAIL', reason: raw.slice(0, 120) }
}
