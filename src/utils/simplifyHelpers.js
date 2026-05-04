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
