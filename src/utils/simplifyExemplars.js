// Hand-written one-shot exemplars used to anchor the simplification prompts.
//
// Style targets the AHRQ Plain Language guidelines:
//   - 8th-grade reading level
//   - Short sentences (~20 words max)
//   - Common words; define medical terms inline
//   - Active voice
//   - Address the reader as "you"
//   - Hedge with "may" / "might" — never give medical advice
//
// The model imitates these examples better than it follows abstract
// style rules, especially under streaming where bad output is visible
// character-by-character. Cost: ~300 tokens per call.
//
// REVIEW NOTES: edit freely. Reading level matters more than poetry.

export const SUMMARIZE_EXEMPLAR = {
  input: {
    briefSummary:
      'This is a Phase 2 study to evaluate the safety and efficacy of pembrolizumab in combination with chemotherapy for patients with metastatic triple-negative breast cancer who have not received prior systemic therapy.',
    eligibility:
      'Inclusion: Adults aged 18-75 with histologically confirmed metastatic triple-negative breast cancer. ECOG 0-1. Adequate organ function. Exclusion: Prior systemic therapy for metastatic disease. Active autoimmune disease. CNS metastases requiring steroids.',
  },
  output: `## What this study is testing
This study tests pembrolizumab, a kind of immunotherapy that helps your immune system fight cancer. Doctors will combine it with standard chemotherapy. The study is looking at people whose breast cancer has spread to other parts of the body (called metastatic) and who have not yet had cancer drugs for it.

## Who can join
You may be eligible if you are 18 to 75 years old and have triple-negative breast cancer that has spread. You should be able to handle daily activities with little help. You probably cannot join if you have already had cancer drugs for the spread, if you have an autoimmune disease that is currently active, or if cancer in your brain needs steroid treatment.`,
}

export const ASSESS_FIT_EXEMPLAR = {
  input: {
    userDescription:
      '52 year old woman with triple negative breast cancer in NYC, did chemo already',
    extractedFields: {
      condition: 'triple negative breast cancer',
      location: 'NYC',
      age: 52,
      sex: 'FEMALE',
    },
    briefSummary:
      'This is a Phase 2 study to evaluate the safety and efficacy of pembrolizumab in combination with chemotherapy for patients with metastatic triple-negative breast cancer who have not received prior systemic therapy.',
    eligibility:
      'Inclusion: Adults aged 18-75 with histologically confirmed metastatic triple-negative breast cancer. ECOG 0-1. Adequate organ function. Exclusion: Prior systemic therapy for metastatic disease. Active autoimmune disease. CNS metastases requiring steroids.',
  },
  output: `Based on what you described, this trial may not be a fit for you. The study is looking for people who have not yet had cancer drugs for breast cancer that has spread. Since you mentioned you already did chemo, you might not be eligible. It is worth asking the study doctors to be sure — your specific history matters.`,
}
