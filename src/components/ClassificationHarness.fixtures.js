// Fixture data for the dev-only Classification Harness (?test=classify).
// Lives next to the component but split out because the trial array is
// 300+ lines and made the harness file hard to navigate when iterating
// on prompts vs data.
//
// `outOfScope: true` flags trials the CT.gov API would NOT return for
// a breast-cancer search — kept in the fixture as wrong-condition
// stress tests, but the harness's "production-realistic agreement"
// toggle excludes them from the headline metric.

export const SAMPLE_TRIALS = [
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
    outOfScope: true, // NSCLC — wouldn't appear in a breast-cancer API search
  },
  {
    nctId: 'NCT05123987',
    title: 'Targeted Therapy in Pediatric Acute Lymphoblastic Leukemia',
    eligibility: 'Inclusion: Pediatric patients aged 2-17 years. Newly diagnosed ALL. Exclusion: Adults. Prior chemotherapy.',
    expected: 'UNLIKELY',
    outOfScope: true, // Pediatric ALL — wouldn't appear in a breast-cancer API search
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
    outOfScope: true,
  },
  {
    nctId: 'NCT04678901',
    title: 'Apixaban vs. Warfarin in Atrial Fibrillation',
    eligibility: 'Inclusion: Adults ≥18 years with non-valvular atrial fibrillation. CHA2DS2-VASc score ≥2. Exclusion: Mechanical heart valve. Active bleeding.',
    expected: 'UNLIKELY',
    outOfScope: true,
  },
  {
    nctId: 'NCT04789012',
    title: 'GLP-1 Agonist for Weight Management in Type 2 Diabetes',
    eligibility: 'Inclusion: Adults 18-75 with Type 2 diabetes mellitus. BMI ≥30. HbA1c 7.0-10.0%. Exclusion: Type 1 diabetes. Active malignancy within 5 years. History of pancreatitis.',
    expected: 'UNLIKELY',
    outOfScope: true,
  },
  {
    nctId: 'NCT04890123',
    title: 'Robotic Prostatectomy Outcomes in Localized Prostate Cancer',
    eligibility: 'Inclusion: Men ≥40 years with biopsy-confirmed clinically localized prostate cancer (T1-T2). Candidate for radical prostatectomy. Exclusion: Prior pelvic surgery or radiation.',
    expected: 'UNLIKELY',
    outOfScope: true,
  },
  {
    nctId: 'NCT04901234',
    title: 'Pediatric Vaccine Immunogenicity Study',
    eligibility: 'Inclusion: Healthy children aged 6 months to 5 years. Up to date on routine immunizations. Exclusion: Immunocompromised. Recent illness within 14 days.',
    expected: 'UNLIKELY',
    outOfScope: true,
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
    outOfScope: true,
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
    outOfScope: true,
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

// Patient description presets for multilingual + edge-case validation. Same
// 58yo woman with breast cancer in Boston, expressed in different languages
// and registers (formal, terse, etc.) so we can stress-test the model's
// understanding without changing the underlying clinical signal.
export const USER_PRESETS = [
  { id: 'en',     label: 'English',                  text: "I'm 58 years old with breast cancer in Boston" },
  { id: 'en-2',   label: 'English (more detail)',    text: "58-year-old woman in Boston, postmenopausal, recently diagnosed with breast cancer, looking for post-chemo treatment options" },
  { id: 'es',     label: 'Spanish (Español)',        text: 'Tengo 58 años, vivo en Boston y tengo cáncer de mama' },
  { id: 'es-2',   label: 'Spanish (more detail)',    text: 'Soy mujer de 58 años, posmenopáusica, vivo en Boston. Me diagnosticaron cáncer de mama y busco opciones de tratamiento después de quimioterapia.' },
  { id: 'zh',     label: 'Mandarin (中文)',          text: '我58岁，住在波士顿，患有乳腺癌' },
  { id: 'ar',     label: 'Arabic (العربية)',        text: 'أنا امرأة عمري 58 عامًا أعيش في بوسطن ومصابة بسرطان الثدي' },
  { id: 'pt',     label: 'Portuguese (Português)',   text: 'Tenho 58 anos, moro em Boston e tenho câncer de mama' },
  { id: 'fr',     label: 'French (Français)',        text: "J'ai 58 ans, je vis à Boston et j'ai un cancer du sein" },
  { id: 'terse',  label: 'Terse / fragments',        text: '58F, BC, Boston' },
]

