import { SUMMARIZE_EXEMPLAR, ASSESS_FIT_EXEMPLAR } from './simplifyExemplars'

// Cache key for an in-memory Map<key, state>. Includes modelKey because
// switching the underlying LLM should invalidate previously generated text.
export function buildCacheKey(nctId, promptType, modelKey) {
  return `${nctId}:${promptType}:${modelKey}`
}

// Section delimiter for the summarize prompt's structured output. Anchored
// to start-of-line so it doesn't false-match a quoted occurrence in prose.
const ELIGIBILITY_DELIMITER = /^##\s+Who can join\b/m
// Allow leading whitespace so the header still matches when a stripped
// <think> block leaves blank lines in front of it.
const SUMMARY_HEADER = /^\s*##\s+What this study is testing[ \t]*\n?/

// Reasoning models (Qwen3) emit <think>…</think> blocks even with
// enable_thinking:false on streaming requests. Strip complete blocks plus
// any unterminated trailing block so partial output renders cleanly.
function stripThinkBlocks(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
}

// Given the running token buffer for an in-flight `summarize` task, return
// what should be rendered right now: { summary, eligibility, complete }.
// Called on every chunk; safe to call with empty or partial buffers.
export function parseSummarizeStream(buffer) {
  const cleaned = stripThinkBlocks(buffer)
  const match = cleaned.match(ELIGIBILITY_DELIMITER)
  if (!match) {
    return {
      summary: stripSummaryHeader(cleaned).trim(),
      eligibility: null,
      complete: false,
    }
  }
  const summaryPart = cleaned.slice(0, match.index)
  const eligibilityPart = cleaned.slice(match.index + match[0].length)
  return {
    summary: stripSummaryHeader(summaryPart).trim(),
    eligibility: eligibilityPart.trim(),
    complete: true,
  }
}

function stripSummaryHeader(text) {
  return text.replace(SUMMARY_HEADER, '')
}

const SUMMARIZE_INSTRUCTIONS = `You translate clinical-trial descriptions into plain language for patients. Write at an 8th-grade reading level. Use short sentences. Use common words. Define medical terms in plain English the first time you use them. Use "you" to address the reader.

CRITICAL — accuracy rules:
- Use ONLY information that appears in the source trial below. Do not add facts from your training data.
- NEVER pad your output with examples that are not in the source. If the source says "solid tumors", do NOT add "(like a tumor in your lung, stomach, or colon)" — those examples are inventions. Stick to what the source says.
- NEVER infer disease stage, severity, or progression from what is not stated. If the source says "early breast cancer", do NOT say "breast cancer that has spread". If the source does not specify, do not guess.
- Do NOT invent age limits, exclusion conditions, drug names, or eligibility details. If the source does not mention autoimmune disease, do not write about it. If the source does not give an age range, do not invent one (do not say "you must be 18 to 75 years old" unless that exact range is in the source).
- The source may discuss a study that ENROLLS patients with multiple conditions (e.g. a long-term follow-up study covering melanoma, NF1, and other tumors). Stay faithful to what the source describes; do not pick one disease and write only about that disease.
- Do not paraphrase in ways that change meaning. "CNS metastases" means cancer that has spread to the brain or spinal cord — it is NOT "brain cancer." "Metastatic" means spread, not "advanced" generically.
- If the eligibility section gets repetitive or you find yourself listing the same point twice, stop and move on. Do not duplicate bullets.
- Do not add closing remarks like "Let me know if..." or "I hope this helps." End after the eligibility section.
- Always emit the section headers exactly: "## What this study is testing" and "## Who can join".`

const ASSESS_FIT_INSTRUCTIONS = `You help patients understand whether a clinical trial might fit their situation. Compare what the patient told you against the trial's basic facts and eligibility. Write 2 to 4 sentences. Be honest about uncertainty — say "may" or "might" rather than "will" or "should." Do not give medical advice. Suggest the patient talk with the study doctors when their specific history matters.

CRITICAL — accuracy rules:
- Use ONLY information from the patient description and the trial below. Do not invent details.
- Do not add closing remarks like "Let me know if...". End after the assessment.`

// When outputLanguage is non-English, the language directive is placed AFTER
// the English exemplar — small models (Gemma 2 2B, Qwen3 1.7B) treat the
// most recent in-context tokens as the strongest signal, and the English
// exemplar otherwise drowns out a top-of-prompt language hint. Headers stay
// in English so the streaming parser (which keys off "## Who can join")
// still works; drug/gene/phase numbers stay in English because patients
// will search ClinicalTrials.gov for them.
function languagePreGenInstruction(outputLanguage) {
  if (!outputLanguage || outputLanguage === 'English') return ''
  return `

LANGUAGE REQUIREMENT — read carefully before writing:
The example above was in English, but YOUR OUTPUT MUST BE IN ${outputLanguage.toUpperCase()}.
Write every sentence of your response in ${outputLanguage}.
The ONLY exceptions are:
- The two section headers stay in English: "## What this study is testing" and "## Who can join"
- Drug names (e.g. trastuzumab deruxtecan, pembrolizumab), gene names (e.g. HER2, BRCA), and clinical-trial phase numbers stay in their English form
Everything else — including all explanations, descriptions, and eligibility text — must be in ${outputLanguage}.
Do NOT write the body in English. Do NOT mix languages within a sentence except for the proper-noun exceptions above.`
}

function languagePostGenReminder(outputLanguage) {
  if (!outputLanguage || outputLanguage === 'English') return ''
  return `\nReminder: write the body in ${outputLanguage}. Headers stay in English.`
}

export function buildSummarizePrompt(trial, options = {}) {
  const ex = SUMMARIZE_EXEMPLAR
  const langPre = languagePreGenInstruction(options.outputLanguage)
  const langPost = languagePostGenReminder(options.outputLanguage)
  return `${SUMMARIZE_INSTRUCTIONS}

Here is an example.

SOURCE TRIAL:
Brief summary: ${ex.input.briefSummary}
Eligibility: ${ex.input.eligibility}

PLAIN-LANGUAGE OUTPUT:
${ex.output}
${langPre}

Now do the same for this trial.

SOURCE TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}
${langPost}
PLAIN-LANGUAGE OUTPUT:
`
}

export function buildAssessFitPrompt(trial, fields, userDescription, options = {}) {
  const ex = ASSESS_FIT_EXEMPLAR
  const descLine = userDescription
    ? `What they said: ${userDescription}`
    : `What they said: (none provided)`
  const isNonEnglish = options.outputLanguage && options.outputLanguage !== 'English'
  const langPre = isNonEnglish
    ? `

LANGUAGE REQUIREMENT — read carefully before writing:
The example above was in English, but YOUR ASSESSMENT MUST BE IN ${options.outputLanguage.toUpperCase()}.
Write every sentence in ${options.outputLanguage}.
Keep drug names (e.g. trastuzumab deruxtecan, pembrolizumab) and gene names (e.g. HER2, BRCA) in their English form.
Do NOT write the assessment in English.`
    : ''
  const langPost = isNonEnglish ? `\nReminder: write your assessment in ${options.outputLanguage}.` : ''
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
${langPre}

Now do the same.

PATIENT:
${descLine}
Their condition: ${fields?.condition ?? 'not given'}, age ${fields?.age ?? 'not given'}, ${fields?.sex ?? 'not given'}

TRIAL:
Brief summary: ${trial.summary ?? ''}
Eligibility: ${trial.eligibility?.criteria ?? ''}
${langPost}
ASSESSMENT:
`
}
