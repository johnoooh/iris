import { useState, useEffect } from 'react'
import { useNLP } from '../hooks/useNLP'
import { useClassifier } from '../hooks/useClassifier'
import { NLP_MODELS, resolveModelKey } from '../utils/nlpModels'

const SAMPLE_TRIALS = [
  {
    nctId: 'NCT05952557',
    title: 'Phase IIIb Study of Ribociclib + Endocrine Therapy in Early Breast Cancer',
    eligibility: 'Inclusion: Adult female, ≥18 years. HR-positive, HER2-negative early breast cancer. Completed definitive surgery. Postmenopausal status confirmed. ECOG 0-1. Adequate organ function. Exclusion: Prior CDK4/6 inhibitor. Pregnancy or breastfeeding. Active second malignancy.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT06104020',
    title: 'Sacituzumab Govitecan in Metastatic Triple-Negative Breast Cancer',
    eligibility: 'Inclusion: Adult, any sex. Histologically confirmed metastatic triple-negative breast cancer (ER<1%, PR<1%, HER2-negative). At least one prior line of systemic therapy in metastatic setting. ECOG 0-2. Measurable disease per RECIST 1.1. Exclusion: Active CNS metastases. Prior topoisomerase I inhibitor.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05887492',
    title: 'Adaptive Radiation Boost in Locally Advanced HER2+ Breast Cancer',
    eligibility: 'Inclusion: Adult female. HER2-positive breast cancer confirmed by IHC 3+ or FISH-positive. Stage II-III disease. Completed neoadjuvant chemotherapy. ECOG 0-1. Exclusion: Prior radiation to chest. Pregnancy.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT06221340',
    title: 'Aerobic Exercise During Adjuvant Chemo for Breast Cancer Survivors',
    eligibility: 'Inclusion: Adult, any sex. Breast cancer, any stage. Currently receiving or scheduled for adjuvant chemotherapy. Cleared by oncologist for moderate exercise. Exclusion: Cardiac contraindications.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT04123456',
    title: 'Pembrolizumab in Advanced Non-Small Cell Lung Cancer',
    eligibility: 'Inclusion: Adult. Histologically confirmed advanced NSCLC. PD-L1 expression ≥50%. ECOG 0-1. Exclusion: Active autoimmune disease. Prior immunotherapy.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT05123987',
    title: 'Targeted Therapy in Pediatric Acute Lymphoblastic Leukemia',
    eligibility: 'Inclusion: Pediatric patients aged 2-17 years. Newly diagnosed ALL. Exclusion: Adults. Prior chemotherapy.',
    expected: 'UNLIKELY',
  },

  // ─── Subtype-gated breast cancer trials — POSSIBLE without confirmed subtype ───
  {
    nctId: 'NCT05300100',
    title: 'Tucatinib + Trastuzumab in HER2-Positive Metastatic Breast Cancer',
    eligibility: 'Inclusion: Adult, any sex, ≥18 years. Histologically confirmed HER2-positive metastatic breast cancer (IHC 3+ or FISH-amplified). At least 2 prior HER2-directed therapies. ECOG 0-1. Exclusion: Untreated brain metastases. Prior tucatinib.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05400201',
    title: 'Olaparib Maintenance in BRCA-Mutated HER2-Negative Breast Cancer',
    eligibility: 'Inclusion: Adult female. HER2-negative breast cancer with germline BRCA1 or BRCA2 mutation (confirmed by central testing). High-risk early disease following adjuvant chemotherapy. Postmenopausal or premenopausal with ovarian suppression. Exclusion: Prior PARP inhibitor.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05511223',
    title: 'CDK4/6 Inhibitor Switch in Hormone-Receptor-Positive Advanced Breast Cancer',
    eligibility: 'Inclusion: Adult women, postmenopausal. HR-positive, HER2-negative advanced or metastatic breast cancer. Disease progression on a prior CDK4/6 inhibitor. ECOG 0-2.',
    expected: 'POSSIBLE',
  },

  // ─── Strong matches for a 58yo with breast cancer ───
  {
    nctId: 'NCT05633445',
    title: 'Cognitive Behavioral Therapy for Cancer-Related Fatigue',
    eligibility: 'Inclusion: Adults ≥18 years with any solid tumor diagnosis (breast, colon, lung, prostate, etc.). Currently in active treatment or within 5 years of treatment completion. Self-reported fatigue ≥4 on a 0-10 scale. Exclusion: Severe untreated depression. Inability to attend weekly sessions.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05755677',
    title: 'Lymphedema Surveillance Program After Breast Cancer Surgery',
    eligibility: 'Inclusion: Adult female ≥18 years. History of breast cancer treated with axillary surgery (sentinel lymph node biopsy or axillary dissection). Within 3 years of surgery. Exclusion: Pre-existing lymphedema. Current breast cancer recurrence.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05822334',
    title: 'Mindfulness-Based Stress Reduction for Breast Cancer Survivors',
    eligibility: 'Inclusion: Adult women ≥21 years. Diagnosed with breast cancer (any stage). Completed primary treatment within the past 5 years OR currently on adjuvant endocrine therapy. Exclusion: Active psychosis. Prior MBSR participation.',
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT05901128',
    title: 'Vaginal Estrogen Safety Study in Postmenopausal Breast Cancer Survivors',
    eligibility: 'Inclusion: Postmenopausal women ages 45-75 with a history of HR-positive or HR-negative breast cancer. Disease-free for ≥1 year. Genitourinary symptoms of menopause. Stable on aromatase inhibitor or tamoxifen, or treatment-free. Exclusion: Current metastatic disease.',
    expected: 'LIKELY',
  },

  // ─── Wrong condition / wrong demographic — clear UNLIKELY ───
  {
    nctId: 'NCT04567890',
    title: 'Pembrolizumab in Advanced Melanoma',
    eligibility: 'Inclusion: Adults with histologically confirmed unresectable Stage III or Stage IV melanoma. ECOG 0-1. No prior systemic therapy for advanced disease. Exclusion: Active autoimmune disease.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04678901',
    title: 'Apixaban vs. Warfarin in Atrial Fibrillation',
    eligibility: 'Inclusion: Adults ≥18 years with non-valvular atrial fibrillation. CHA2DS2-VASc score ≥2. Exclusion: Mechanical heart valve. Active bleeding.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04789012',
    title: 'GLP-1 Agonist for Weight Management in Type 2 Diabetes',
    eligibility: 'Inclusion: Adults 18-75 with Type 2 diabetes mellitus. BMI ≥30. HbA1c 7.0-10.0%. Exclusion: Type 1 diabetes. Active malignancy within 5 years. History of pancreatitis.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04890123',
    title: 'Robotic Prostatectomy Outcomes in Localized Prostate Cancer',
    eligibility: 'Inclusion: Men ≥40 years with biopsy-confirmed clinically localized prostate cancer (T1-T2). Candidate for radical prostatectomy. Exclusion: Prior pelvic surgery or radiation.',
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT04901234',
    title: 'Pediatric Vaccine Immunogenicity Study',
    eligibility: 'Inclusion: Healthy children aged 6 months to 5 years. Up to date on routine immunizations. Exclusion: Immunocompromised. Recent illness within 14 days.',
    expected: 'UNLIKELY',
  },

  // ─── Edge cases — should challenge the model ───
  {
    nctId: 'NCT05012345',
    title: 'Palliative Care Integration in Patients with Advanced Solid Tumors',
    eligibility: 'Inclusion: Adults ≥18 years with advanced (Stage IV) solid tumor of any primary site (breast, lung, GI, GU, GYN). Estimated prognosis 6-24 months. ECOG 0-3. Exclusion: Currently enrolled in hospice.',
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT05123450',
    title: 'Premenopausal Breast Cancer: Ovarian Function Suppression Trial',
    eligibility: 'Inclusion: Premenopausal women ages 18-45 with newly diagnosed HR-positive early breast cancer. Confirmed premenopausal by FSH and estradiol levels. Exclusion: Postmenopausal status. Prior ovarian suppression therapy.',
    expected: 'UNLIKELY',
  },

  // ─── Realistic-length eligibility (~2-3.5kB each) — stress-tests how the
  //     model handles formal CT.gov noise and how truncation affects accuracy.
  //     Try these with eligMax = 800 vs 3000 vs 6000 to see the trade-off.
  {
    nctId: 'NCT-LONG-01',
    title: 'Phase II Study of Sacituzumab Govitecan-hziy in Patients with HR-Positive, HER2-Negative Metastatic Breast Cancer After Endocrine Therapy and CDK4/6 Inhibitor',
    eligibility: `Inclusion Criteria:

1. Female participants ≥18 years of age at the time of signing informed consent.
2. Histologically or cytologically confirmed adenocarcinoma of the breast that is metastatic or locally advanced and not amenable to curative resection or radiotherapy.
3. Documentation of estrogen receptor (ER)-positive (≥1% staining by IHC) and/or progesterone receptor (PR)-positive (≥1% staining by IHC) tumor status, in accordance with ASCO/CAP guidelines.
4. Documentation of HER2-negative status defined as IHC 0, IHC 1+, or IHC 2+ with negative in situ hybridization (ISH), per ASCO/CAP guidelines.
5. Disease progression on or after at least one prior CDK4/6 inhibitor (palbociclib, ribociclib, or abemaciclib) administered for advanced or metastatic disease, in combination with an aromatase inhibitor or fulvestrant.
6. Disease progression on or after at least one and no more than two prior endocrine therapies (e.g., aromatase inhibitor, fulvestrant, tamoxifen) for advanced or metastatic disease.
7. No more than one prior chemotherapy regimen for metastatic disease.
8. Postmenopausal status, OR premenopausal/perimenopausal women who agree to receive concurrent ovarian function suppression with a luteinizing hormone-releasing hormone (LHRH) agonist throughout study treatment.
9. Measurable disease per RECIST v1.1, or non-measurable bone-only disease assessable per protocol-specified criteria.
10. ECOG performance status 0 or 1.
11. Adequate organ function:
    - Absolute neutrophil count (ANC) ≥1.5 × 10^9/L
    - Platelets ≥100 × 10^9/L
    - Hemoglobin ≥9.0 g/dL (transfusion permitted)
    - Total bilirubin ≤1.5 × ULN (≤3 × ULN for participants with documented Gilbert syndrome)
    - AST and ALT ≤2.5 × ULN (≤5 × ULN if liver metastases present)
    - Creatinine clearance ≥50 mL/min by Cockcroft-Gault equation
    - INR and aPTT ≤1.5 × ULN unless on anticoagulants
12. Resolution of all acute toxic effects of prior anti-cancer therapy or surgical procedures to NCI CTCAE v5.0 Grade ≤1 (except alopecia and Grade 2 neuropathy).
13. Willingness to provide tumor tissue (archival or fresh biopsy) for biomarker analyses.

Exclusion Criteria:

1. Prior treatment with sacituzumab govitecan or any other Trop-2-directed therapy.
2. Prior treatment with an antibody-drug conjugate containing a topoisomerase I inhibitor payload (e.g., trastuzumab deruxtecan).
3. Active CNS metastases. Participants with previously treated, asymptomatic CNS metastases are eligible if clinically stable for ≥4 weeks off corticosteroids and anticonvulsants.
4. Leptomeningeal disease.
5. Known active infection requiring systemic therapy, including untreated HIV, active HBV (HBsAg positive or HBV DNA detectable), or active HCV (HCV RNA detectable).
6. Significant cardiovascular disease, including: NYHA Class III or IV congestive heart failure, myocardial infarction or unstable angina within 6 months, uncontrolled arrhythmia, baseline QTcF >470 ms.
7. History of another malignancy within 3 years, except for adequately treated non-melanoma skin cancer, in situ cervical or breast cancer, or low-risk localized prostate cancer on active surveillance.
8. Known hypersensitivity to irinotecan or any component of the study drug formulation.
9. Pregnant or breastfeeding women. Women of childbearing potential must agree to use highly effective contraception during the study and for 6 months after the last dose.
10. Concurrent participation in another therapeutic clinical trial.
11. Major surgery within 4 weeks prior to first dose.
12. Live vaccines within 30 days prior to first dose.`,
    expected: 'POSSIBLE',
  },
  {
    nctId: 'NCT-LONG-02',
    title: 'Randomized Phase III Trial of Adjuvant Endocrine Therapy ± Abemaciclib in Postmenopausal Women with HR-Positive, HER2-Negative, Node-Positive Early Breast Cancer at High Risk of Recurrence',
    eligibility: `Inclusion Criteria:

1. Female, postmenopausal at the time of randomization. Postmenopausal status defined as: (a) prior bilateral oophorectomy, (b) age ≥60 years, OR (c) age <60 with amenorrhea ≥12 months in the absence of chemotherapy, tamoxifen, or ovarian suppression AND FSH and estradiol in the postmenopausal range.
2. Age 18 to 75 years inclusive at the time of consent.
3. ECOG performance status of 0, 1, or 2.
4. Histologically confirmed invasive breast carcinoma. Multicentric or multifocal disease is allowed if all foci meet eligibility.
5. Hormone receptor-positive disease, defined as ≥1% of tumor cells staining positive for estrogen receptor and/or progesterone receptor by IHC, per ASCO/CAP guidelines.
6. HER2-negative disease, defined as IHC 0, 1+, or 2+ with negative reflex ISH testing per ASCO/CAP guidelines.
7. Stage II or III disease with high-risk pathologic features, defined as ≥1 of the following:
    - ≥4 positive axillary lymph nodes, OR
    - 1-3 positive axillary lymph nodes AND tumor size ≥5 cm, OR
    - 1-3 positive axillary lymph nodes AND histologic grade 3, OR
    - 1-3 positive axillary lymph nodes AND Ki-67 ≥20%
8. Definitive surgical treatment of primary tumor with negative margins (lumpectomy with whole-breast irradiation OR mastectomy with or without post-mastectomy radiation per institutional standard).
9. Completion of any neoadjuvant or adjuvant chemotherapy at least 21 days but no more than 16 months prior to randomization.
10. Initiation of adjuvant endocrine therapy (aromatase inhibitor, with or without LHRH agonist) is permitted, but participants must not have received endocrine therapy for more than 12 weeks prior to randomization.
11. Adequate organ function within 14 days of randomization:
    - ANC ≥1.5 × 10^9/L
    - Platelets ≥100 × 10^9/L
    - Hemoglobin ≥10.0 g/dL
    - Total bilirubin ≤1.5 × ULN
    - AST/ALT ≤2.5 × ULN
    - Creatinine clearance ≥50 mL/min
12. Negative serum or urine pregnancy test for participants of childbearing potential.

Exclusion Criteria:

1. Stage IV (metastatic) breast cancer or evidence of distant metastases on staging imaging.
2. Inflammatory breast cancer.
3. Bilateral invasive breast cancer.
4. Prior treatment with any CDK4/6 inhibitor in any setting.
5. Prior anti-cancer therapy other than chemotherapy and locoregional therapy for the current breast cancer diagnosis.
6. History of another malignancy within 5 years prior to randomization, except adequately treated non-melanoma skin cancer, in situ cervical cancer, or contralateral DCIS.
7. Active or chronic hepatitis B or C infection, or known HIV infection.
8. Significant uncontrolled cardiovascular disease: NYHA Class III/IV heart failure, myocardial infarction within 6 months, ventricular arrhythmia requiring treatment.
9. History of interstitial lung disease or pneumonitis requiring corticosteroids.
10. Major surgery (other than breast cancer surgery) within 28 days of randomization.
11. Receiving strong CYP3A inhibitors or inducers within 14 days that cannot be discontinued.
12. Inability to swallow oral medications or significant malabsorption.
13. Pregnant or breastfeeding (premenopausal participants only — see inclusion criterion 1).`,
    expected: 'LIKELY',
  },
  {
    nctId: 'NCT-LONG-03',
    title: 'Phase III Study of Pembrolizumab Plus Chemotherapy versus Chemotherapy Alone for First-Line Treatment of Metastatic Squamous Non-Small Cell Lung Cancer',
    eligibility: `Inclusion Criteria:

1. Histologically or cytologically confirmed Stage IV squamous non-small cell lung cancer (NSCLC) per AJCC 8th edition.
2. Male or female ≥18 years of age.
3. No prior systemic therapy for metastatic NSCLC. Prior adjuvant or neoadjuvant chemotherapy is allowed if completed ≥6 months prior to enrollment.
4. Measurable disease per RECIST v1.1.
5. Provision of a tumor tissue sample (archival or fresh biopsy) adequate for PD-L1 IHC testing using the 22C3 pharmDx assay.
6. ECOG performance status 0 or 1.
7. Life expectancy ≥3 months.
8. Adequate organ function within 10 days of randomization:
    - ANC ≥1.5 × 10^9/L without G-CSF support
    - Platelets ≥100 × 10^9/L without transfusion
    - Hemoglobin ≥9.0 g/dL
    - Total bilirubin ≤1.5 × ULN
    - AST/ALT ≤2.5 × ULN (≤5 × ULN if liver involvement)
    - Creatinine clearance ≥45 mL/min
    - INR/aPTT ≤1.5 × ULN
9. Female participants of childbearing potential and male participants with partners of childbearing potential must agree to use effective contraception throughout treatment and for 120 days after last dose.

Exclusion Criteria:

1. Histology of mixed small cell and non-small cell lung cancer, or predominantly non-squamous histology.
2. Known sensitizing EGFR mutation, ALK rearrangement, ROS1 rearrangement, BRAF V600E mutation, or other actionable alteration for which an approved targeted therapy is the standard of care.
3. Prior treatment with any PD-1, PD-L1, PD-L2, or CTLA-4 inhibitor.
4. Active autoimmune disease requiring systemic immunosuppression within 2 years. Replacement therapy (e.g., thyroxine, insulin, physiologic corticosteroids) is permitted.
5. History of pneumonitis requiring corticosteroids, or active pneumonitis.
6. Active CNS metastases or carcinomatous meningitis. Participants with previously treated, asymptomatic CNS metastases stable for ≥4 weeks may be eligible.
7. Active infection requiring systemic therapy.
8. Known active HIV, HBV, or HCV infection.
9. Live vaccine within 30 days of first dose.
10. History of solid organ or allogeneic stem cell transplant.
11. Pregnant or breastfeeding women.
12. History of another malignancy within 3 years, except for adequately treated non-melanoma skin cancer or in situ disease.`,
    expected: 'UNLIKELY',
  },
  {
    nctId: 'NCT-LONG-04',
    title: 'Multicenter Randomized Trial of Empagliflozin in Patients with Heart Failure with Preserved Ejection Fraction and Type 2 Diabetes',
    eligibility: `Inclusion Criteria:

1. Adults aged 40 to 85 years at consent.
2. Documented diagnosis of heart failure with preserved ejection fraction (HFpEF):
    - Left ventricular ejection fraction (LVEF) ≥50% on echocardiogram within the past 12 months
    - NYHA functional class II, III, or IV
    - Elevated NT-proBNP ≥300 pg/mL (or ≥600 pg/mL if atrial fibrillation present)
    - Structural heart disease on echocardiography (LV hypertrophy or left atrial enlargement) OR documented prior HF hospitalization
3. Documented Type 2 diabetes mellitus (T2DM) per ADA criteria, with HbA1c 6.5% to 10.0% at screening.
4. Stable background heart failure therapy for ≥4 weeks (diuretic if indicated; ACEi/ARB/ARNI per guideline; beta-blocker per guideline).
5. eGFR ≥25 mL/min/1.73m^2 by CKD-EPI equation.
6. Body mass index 20 to 45 kg/m^2.
7. Able and willing to provide written informed consent and adhere to study procedures.

Exclusion Criteria:

1. Type 1 diabetes mellitus.
2. History of diabetic ketoacidosis within 12 months.
3. LVEF <50% on most recent echocardiogram.
4. Acute decompensated heart failure requiring IV diuretics within 4 weeks of screening.
5. Acute coronary syndrome, stroke, or transient ischemic attack within 90 days.
6. Planned cardiac surgery, percutaneous coronary intervention, or device implantation within 90 days.
7. Symptomatic hypotension or systolic blood pressure <100 mmHg at screening.
8. Significant valvular heart disease (severe aortic stenosis, severe mitral regurgitation requiring surgery).
9. Hypertrophic cardiomyopathy, infiltrative cardiomyopathy, or constrictive pericarditis.
10. eGFR <25 mL/min/1.73m^2 or end-stage renal disease requiring dialysis.
11. Known active malignancy requiring treatment within the past 12 months. Participants with a history of cancer who are disease-free for >12 months are eligible.
12. Severe hepatic impairment (Child-Pugh C).
13. Pregnancy or breastfeeding.
14. Known hypersensitivity to SGLT2 inhibitors.
15. Participation in another interventional clinical trial within 30 days.
16. Life expectancy <12 months due to non-cardiovascular cause.`,
    expected: 'UNLIKELY',
  },
]

const DEFAULT_PROMPT = `You decide whether to show a clinical trial to a patient based on the patient's short self-description. Be conservative: the patient only told you what they explicitly stated — do not assume HER2/HR/BRCA status, stage, prior treatment, or other facts.

Use these labels:
- LIKELY: the trial's primary indication matches the patient's condition AND the patient meets every demographic requirement.
- POSSIBLE: the trial's indication matches but at least one criterion (subtype, biomarker, stage, mutation, prior therapy) is unstated by the patient.
- UNLIKELY: the trial is for a different disease, or the patient is the wrong sex/age.

Examples:

Patient: "62-year-old man with prostate cancer"
Trial: Phase III Olaparib in BRCA-Mutated Metastatic Prostate Cancer (Eligibility: men with BRCA mutation, metastatic prostate cancer, prior androgen therapy)
Answer: POSSIBLE | matches prostate cancer in a man, but BRCA status not stated

Patient: "62-year-old man with prostate cancer"
Trial: Trastuzumab in HER2+ Breast Cancer (Eligibility: adult women with HER2+ breast cancer)
Answer: UNLIKELY | trial is for breast cancer in women; patient has prostate cancer

Patient: "62-year-old man with prostate cancer"
Trial: Exercise Intervention for Prostate Cancer Survivors (Eligibility: adult men with any-stage prostate cancer history)
Answer: LIKELY | adult man with prostate cancer history matches the inclusion criteria

Now classify:

Patient: {{user}}
Trial: {{title}}
Eligibility: {{eligibility}}

Answer (one line, format exactly "<LABEL> | <one short reason>"):`

const DEFAULT_USER_DESC = "I'm 58 years old with breast cancer in Boston"

function parseVerdict(raw) {
  if (!raw || typeof raw !== 'string') return { verdict: 'PARSE_FAIL', reason: '(empty output)' }
  const m = raw.match(/^\s*(LIKELY|POSSIBLE|UNLIKELY)\s*[|:\-—]\s*(.+?)\s*$/im)
  if (m) return { verdict: m[1].toUpperCase(), reason: m[2].trim() }
  const w = raw.match(/\b(LIKELY|POSSIBLE|UNLIKELY)\b/i)
  if (w) {
    return {
      verdict: w[1].toUpperCase(),
      reason: raw.replace(w[0], '').replace(/^[\s|:\-—]+/, '').trim() || '(no reason)',
    }
  }
  return { verdict: 'PARSE_FAIL', reason: raw.slice(0, 120) }
}

const VERDICT_STYLES = {
  LIKELY:     'bg-signal-good-bg text-signal-good',
  POSSIBLE:   'bg-signal-warn-bg text-signal-warn',
  UNLIKELY:   'bg-parchment-200 text-parchment-700',
  PARSE_FAIL: 'bg-signal-bad-bg text-signal-bad',
  PENDING:    'bg-parchment-100 text-parchment-700',
}

export default function ClassificationHarness() {
  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )
  const model = NLP_MODELS[modelKey]
  const { status, progress, error, load, webGPUSupported } = useNLP()
  const { classifyOne } = useClassifier()

  const [userDesc, setUserDesc] = useState(DEFAULT_USER_DESC)
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT)
  const [trialsJson, setTrialsJson] = useState(JSON.stringify(SAMPLE_TRIALS, null, 2))
  const [concurrency, setConcurrency] = useState(3)
  const [eligMax, setEligMax] = useState(1500)
  const [results, setResults] = useState([])
  const [running, setRunning] = useState(false)
  const [startT, setStartT] = useState(0)
  const [, setTick] = useState(0)

  // Lightweight ticker so elapsed time updates while a run is in flight.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(t => t + 1), 250)
    return () => clearInterval(id)
  }, [running])

  function getProgressLabel() {
    if (!progress) return 'Loading model…'
    return progress.text || `Loading model… ${Math.round((progress.progress ?? 0) * 100)}%`
  }

  async function run() {
    let trials
    try {
      trials = JSON.parse(trialsJson)
      if (!Array.isArray(trials)) throw new Error('Not an array')
    } catch (e) {
      alert('Trials JSON is invalid: ' + e.message)
      return
    }

    setRunning(true)
    setStartT(performance.now())
    const initial = trials.map(trial => ({ trial, status: 'PENDING' }))
    setResults(initial)

    const queue = trials.map((trial, idx) => ({ idx, trial }))
    const workersN = Math.min(concurrency, trials.length)

    async function worker() {
      while (queue.length) {
        const { idx, trial } = queue.shift()
        const elig = (trial.eligibility || '').slice(0, eligMax)
        const prompt = promptTemplate
          .replace('{{user}}', userDesc)
          .replace('{{title}}', trial.title || trial.briefTitle || '')
          .replace('{{eligibility}}', elig)
        try {
          const { raw, latencyMs } = await classifyOne(prompt)
          const parsed = parseVerdict(raw)
          setResults(prev => {
            const next = [...prev]
            next[idx] = { trial, status: 'DONE', raw, latencyMs, ...parsed }
            return next
          })
        } catch (err) {
          setResults(prev => {
            const next = [...prev]
            next[idx] = {
              trial,
              status: 'DONE',
              raw: '',
              latencyMs: 0,
              verdict: 'PARSE_FAIL',
              reason: err?.message ?? 'classify error',
            }
            return next
          })
        }
      }
    }

    await Promise.all(Array.from({ length: workersN }, worker))
    setRunning(false)
  }

  function reset() {
    setTrialsJson(JSON.stringify(SAMPLE_TRIALS, null, 2))
    setResults([])
  }

  const [copyState, setCopyState] = useState('idle') // idle | copied | error
  async function copyMarkdown() {
    const md = buildMarkdownReport({
      userDesc,
      promptTemplate,
      eligMax,
      modelLabel: model.label,
      results,
      stats: { done: done.length, total: results.length, elapsed, avgLat, maxLat, parseRate, parseFails, agreementPct, matches, withExpected: withExpected.length },
    })
    try {
      await navigator.clipboard.writeText(md)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2400)
    }
  }

  // ───────── stats ─────────
  const done = results.filter(r => r.status === 'DONE')
  const lats = done.map(r => r.latencyMs).filter(n => n != null)
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0
  const maxLat = lats.length ? Math.round(Math.max(...lats)) : 0
  const parseFails = done.filter(r => r.verdict === 'PARSE_FAIL').length
  const parseRate = done.length ? Math.round(((done.length - parseFails) / done.length) * 100) : 0
  const elapsed = startT ? ((performance.now() - startT) / 1000).toFixed(1) : '0.0'
  const withExpected = done.filter(r => r.trial.expected)
  const matches = withExpected.filter(r => r.verdict === r.trial.expected).length
  const agreementPct = withExpected.length ? Math.round((matches / withExpected.length) * 100) : null

  const canRun = status === 'ready' && !running

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-7 pb-20">
      <h1 className="font-serif font-semibold text-[28px] tracking-tight text-parchment-950 mb-1">
        Classification harness
      </h1>
      <p className="text-[13px] text-parchment-700 max-w-[640px] leading-relaxed mb-6">
        Validate the proposed Stage-1 classifier (LIKELY / POSSIBLE / UNLIKELY) against real
        ClinicalTrials.gov payloads using the on-device {model.label}. Pass criteria from the
        Handoff: parse rate ≥ 90%, avg latency &lt; 1.5s, agreement ≥ 80%.
      </p>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-iris-700 mb-1">model</div>
            <div className="font-mono text-[12px] text-parchment-900">
              {model.label} ({model.sizeLabel}) · status:{' '}
              <strong className={status === 'ready' ? 'text-signal-good' : 'text-parchment-700'}>
                {status}
              </strong>
              {status === 'downloading' && progress && (
                <span className="text-parchment-500"> · {Math.round((progress.progress ?? 0) * 100)}%</span>
              )}
            </div>
            {status === 'downloading' && (
              <p className="font-mono text-[11px] text-parchment-700 mt-1">{getProgressLabel()}</p>
            )}
            {!webGPUSupported && (
              <p className="text-[12px] text-signal-bad mt-1">WebGPU unavailable in this browser.</p>
            )}
            {error && <p className="text-[12px] text-signal-bad mt-1">{error}</p>}
          </div>
          {status !== 'ready' && status !== 'downloading' && webGPUSupported && (
            <button
              type="button"
              onClick={() => load(model.id, { isThinking: model.isThinking, chatOpts: model.chatOpts })}
              className="bg-iris-600 text-white px-4 py-2 rounded-md text-[13px] font-semibold hover:bg-iris-700"
            >
              Load model
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <h2 className="font-serif font-semibold text-base mb-3">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
              User description
            </label>
            <textarea
              rows={3}
              value={userDesc}
              onChange={e => setUserDesc(e.target.value)}
              className="w-full text-[13px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
              Classify prompt template
            </label>
            <textarea
              rows={6}
              value={promptTemplate}
              onChange={e => setPromptTemplate(e.target.value)}
              className="w-full font-mono text-[12px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-iris-700 mb-1.5 block">
            Trials (JSON array — fixture loaded by default)
          </label>
          <textarea
            rows={10}
            value={trialsJson}
            onChange={e => setTrialsJson(e.target.value)}
            className="w-full font-mono text-[11.5px] px-3 py-2.5 border border-parchment-300 rounded-lg bg-parchment-50 text-parchment-900 resize-y focus:outline-none focus:ring-2 focus:ring-iris-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            type="button"
            disabled={!canRun}
            onClick={run}
            className="bg-iris-600 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-iris-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? `Running… (${done.length}/${results.length})` : 'Run classification'}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={running}
            className="border border-parchment-300 text-parchment-900 px-4 py-2 rounded-lg text-[12px] hover:bg-parchment-100 disabled:opacity-50"
          >
            Reset trials
          </button>
          <span
            className="inline-flex items-center gap-2 text-[11px] text-parchment-700"
            title="WebLLM's MLCEngine is single-threaded — parallel inference clobbers state. Requests serialize through a hook-level promise chain regardless of caller concurrency."
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.04em]">execution</span>
            serial (engine constraint)
          </span>
          <label className="inline-flex items-center gap-2 text-[12px] text-parchment-700">
            Eligibility max chars
            <input
              type="number"
              min={200}
              max={8000}
              step={100}
              value={eligMax}
              onChange={e => setEligMax(parseInt(e.target.value, 10) || 1500)}
              disabled={running}
              className="w-[90px] px-2 py-1 text-[12px] border border-parchment-300 rounded bg-white"
            />
          </label>
        </div>

        {(running || done.length > 0) && (
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-parchment-700 mt-3">
            <span><strong className="text-parchment-950">{done.length} / {results.length}</strong> done</span>
            <span>elapsed <strong className="text-parchment-950">{elapsed}s</strong></span>
            <span>avg latency <strong className="text-parchment-950">{avgLat}ms</strong></span>
            <span>max latency <strong className="text-parchment-950">{maxLat}ms</strong></span>
            <span>parse rate <strong className="text-parchment-950">{parseRate}%</strong></span>
            <span>parse fails <strong className="text-parchment-950">{parseFails}</strong></span>
            {done.length > 0 && !running && (
              <button
                type="button"
                onClick={copyMarkdown}
                className="ml-auto inline-flex items-center gap-1.5 border border-iris-300 text-iris-700 hover:bg-iris-50 px-2.5 py-1 rounded text-[11px] transition-colors"
                title="Copy a shareable markdown summary of this run to your clipboard"
              >
                {copyState === 'copied' ? '✓ copied' : copyState === 'error' ? 'copy failed' : 'copy results as markdown'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-parchment-200 rounded-xl p-5 mb-4">
        <h2 className="font-serif font-semibold text-base mb-3">Results</h2>
        {results.length === 0 ? (
          <p className="text-parchment-500 italic text-[13px] py-6 text-center">
            No results yet — click <strong>Run classification</strong>.
          </p>
        ) : (
          <ResultsTable rows={results} />
        )}
        {agreementPct != null && !running && (
          <div className="font-mono text-[11px] text-parchment-700 mt-3 px-3 py-2.5 bg-iris-50 border border-iris-100 rounded-lg leading-relaxed">
            <strong className="text-iris-700">Agreement with expected:</strong>{' '}
            {matches} / {withExpected.length} ({agreementPct}%) — useful as a smoke test on a labeled
            held-out set. Below ~80% means the prompt or model needs work before this drives sort order.
          </div>
        )}
      </div>

      <details className="text-[12px] text-parchment-700">
        <summary className="cursor-pointer font-mono text-iris-700">Pass criteria (from Handoff)</summary>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Parse rate ≥ 90% on 50+ real trials</li>
          <li>Avg latency &lt; 1.5s per trial on a mid-range laptop</li>
          <li>Agreement ≥ 80% on a labeled held-out set</li>
          <li>No catastrophic UNLIKELY false-negatives (a viable trial ranked as UNLIKELY)</li>
        </ul>
      </details>
    </div>
  )
}

function buildMarkdownReport({ userDesc, promptTemplate, eligMax, modelLabel, results, stats }) {
  const escape = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
  const truncate = (s, n) => {
    const t = escape(s)
    return t.length > n ? t.slice(0, n - 1) + '…' : t
  }

  const lines = []
  lines.push('# Classification harness run')
  lines.push('')
  lines.push(`**Model:** ${modelLabel}`)
  lines.push(`**User description:** ${userDesc}`)
  lines.push(`**Eligibility max chars:** ${eligMax}`)
  lines.push('')
  lines.push('## Stats')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Done | ${stats.done} / ${stats.total} |`)
  lines.push(`| Elapsed | ${stats.elapsed}s |`)
  lines.push(`| Avg latency | ${stats.avgLat}ms |`)
  lines.push(`| Max latency | ${stats.maxLat}ms |`)
  lines.push(`| Parse rate | ${stats.parseRate}% (${stats.parseFails} fails) |`)
  if (stats.agreementPct != null) {
    lines.push(`| Agreement | ${stats.matches} / ${stats.withExpected} (${stats.agreementPct}%) |`)
  }
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push(`| Trial | NCT | Verdict | Expected | Match | Latency | Reason / Raw |`)
  lines.push(`|---|---|---|---|---|---|---|`)
  for (const r of results) {
    if (r.status !== 'DONE') continue
    const v = r.verdict || 'PARSE_FAIL'
    const exp = r.trial.expected || '—'
    const match = r.trial.expected ? (r.verdict === r.trial.expected ? '✓' : '✗') : ''
    const latency = r.latencyMs != null ? `${Math.round(r.latencyMs)}ms` : '—'
    const reasonOrRaw = r.reason && r.reason !== '(no reason)' ? r.reason : `raw: ${r.raw || '—'}`
    lines.push(`| ${truncate(r.trial.title || r.trial.briefTitle || r.trial.nctId, 80)} | ${escape(r.trial.nctId || '')} | ${v} | ${exp} | ${match} | ${latency} | ${truncate(reasonOrRaw, 140)} |`)
  }
  lines.push('')
  lines.push('<details>')
  lines.push('<summary>Prompt template used</summary>')
  lines.push('')
  lines.push('```')
  lines.push(promptTemplate)
  lines.push('```')
  lines.push('</details>')
  return lines.join('\n')
}

function ResultsTable({ rows }) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '38%' }}>
            Trial
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '14%' }}>
            Verdict
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '12%' }}>
            Latency
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200">
            Raw output / reason
          </th>
          <th className="text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-parchment-700 px-2.5 py-2 border-b border-parchment-200" style={{ width: '12%' }}>
            Expected
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const verdict = r.status === 'PENDING' ? 'PENDING' : (r.verdict || 'PARSE_FAIL')
          const expected = r.trial.expected || '—'
          const match = r.verdict && r.trial.expected
            ? (r.verdict === r.trial.expected ? '✓' : '✗')
            : ''
          const matchColor = match === '✓' ? 'text-signal-good' : match === '✗' ? 'text-signal-bad' : 'text-parchment-500'
          return (
            <tr key={i}>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <div className="font-serif font-semibold text-parchment-950 text-[13.5px] leading-snug">
                  {r.trial.title || r.trial.briefTitle || r.trial.nctId}
                </div>
                <div className="font-mono text-[10.5px] text-parchment-500 mt-0.5">
                  {r.trial.nctId || ''}
                </div>
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full tracking-[0.04em] ${VERDICT_STYLES[verdict] ?? ''}`}>
                  {verdict}
                </span>
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top font-mono text-[12px] text-parchment-700">
                {r.latencyMs != null ? `${Math.round(r.latencyMs)}ms` : '—'}
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top">
                <div className="text-[12.5px] text-parchment-900 leading-relaxed">{r.reason || '—'}</div>
                {r.raw && r.raw !== r.reason && (
                  <div className="font-mono text-[11px] text-parchment-700 mt-1 whitespace-pre-wrap break-words max-w-[380px]">
                    raw: {r.raw}
                  </div>
                )}
              </td>
              <td className="px-2.5 py-3 border-b border-parchment-100 align-top font-mono text-[11px] text-parchment-700">
                {expected}
                {match && <span className={`ml-1.5 font-semibold ${matchColor}`}>{match}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
