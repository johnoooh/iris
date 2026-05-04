import { SUMMARIZE_EXEMPLAR, ASSESS_FIT_EXEMPLAR } from './simplifyExemplars'

// Cache key for an in-memory Map<key, state>. Includes modelKey because
// switching the underlying LLM should invalidate previously generated text.
export function buildCacheKey(nctId, promptType, modelKey) {
  return `${nctId}:${promptType}:${modelKey}`
}

// Section delimiter for the summarize prompt's structured output. Anchored
// to start-of-line so it doesn't false-match a quoted occurrence in prose.
const ELIGIBILITY_DELIMITER = /^##\s+Who can join\b/m
const SUMMARY_HEADER = /^##\s+What this study is testing[ \t]*\n?/

// Given the running token buffer for an in-flight `summarize` task, return
// what should be rendered right now: { summary, eligibility, complete }.
// Called on every chunk; safe to call with empty or partial buffers.
export function parseSummarizeStream(buffer) {
  const match = buffer.match(ELIGIBILITY_DELIMITER)
  if (!match) {
    return {
      summary: stripSummaryHeader(buffer).trim(),
      eligibility: null,
      complete: false,
    }
  }
  const summaryPart = buffer.slice(0, match.index)
  const eligibilityPart = buffer.slice(match.index + match[0].length)
  return {
    summary: stripSummaryHeader(summaryPart).trim(),
    eligibility: eligibilityPart.trim(),
    complete: true,
  }
}

function stripSummaryHeader(text) {
  return text.replace(SUMMARY_HEADER, '')
}

const SUMMARIZE_INSTRUCTIONS = `You translate clinical-trial descriptions into plain language for patients. Write at an 8th-grade reading level. Use short sentences. Use common words. Define medical terms in plain English the first time you use them. Use "you" to address the reader. Be accurate — do not invent details that are not in the source.`

const ASSESS_FIT_INSTRUCTIONS = `You help patients understand whether a clinical trial might fit their situation. Compare what the patient told you against the trial's basic facts and eligibility. Write 2 to 4 sentences. Be honest about uncertainty — say "may" or "might" rather than "will" or "should." Do not give medical advice. Suggest the patient talk with the study doctors when their specific history matters.`

export function buildSummarizePrompt(trial) {
  const ex = SUMMARIZE_EXEMPLAR
  return `${SUMMARIZE_INSTRUCTIONS}

Here is an example.

SOURCE TRIAL:
Brief summary: ${ex.input.briefSummary}
Eligibility: ${ex.input.eligibility}

PLAIN-LANGUAGE OUTPUT:
${ex.output}

Now do the same for this trial.

SOURCE TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}

PLAIN-LANGUAGE OUTPUT:
`
}

export function buildAssessFitPrompt(trial, fields, userDescription) {
  const ex = ASSESS_FIT_EXEMPLAR
  const descLine = userDescription
    ? `What they said: ${userDescription}`
    : `What they said: (none provided)`
  return `${ASSESS_FIT_INSTRUCTIONS}

Here is an example.

PATIENT:
What they said: ${ex.input.userDescription}
Their condition: ${ex.input.extractedFields.condition}, age ${ex.input.extractedFields.age}, ${ex.input.extractedFields.sex}

TRIAL:
Brief summary: ${ex.input.briefSummary}
Eligibility: ${ex.input.eligibility}

ASSESSMENT:
${ex.output}

Now do the same.

PATIENT:
${descLine}
Their condition: ${fields?.condition ?? 'not given'}, age ${fields?.age ?? 'not given'}, ${fields?.sex ?? 'not given'}

TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}

ASSESSMENT:
`
}
