# IRIS: A Privacy-First Clinical Trial Finder

*Named for Iris Long (1934–), a pharmaceutical chemist who worked at Sloan-Kettering for eleven years and became a pivotal ACT-UP activist. She walked into an ACT-UP meeting in 1987 and told the room they didn't know anything about the science, the drugs, or how the system worked — then offered to teach anyone who wanted to learn. She founded the Treatment and Data Committee, organized the AIDS Treatment Registry, and dedicated herself to making clinical trial and treatment information accessible to the people who needed it most. Her work helped turn AIDS from a death sentence into a manageable condition.*

## The Problem

The existing ClinicalTrials.gov interface was built for researchers, not patients. It surfaces overwhelming amounts of technical jargon — ECOG performance status scores, MeSH terms, complex eligibility criteria — that creates a barrier for the people who need this information most. Conversations with ACT-UP members confirmed that finding relevant clinical trials remains a significant challenge for their community, particularly for people without medical backgrounds or institutional support.

Communities that have historically had to fight for access to medical information deserve tools built with their needs and skepticism in mind.

## The Vision

IRIS is a fully open-source, privacy-first clinical trial discovery tool that runs entirely in the user's browser. No data is collected, no servers store queries, and no accounts are required. A fine-tuned small language model runs locally in the browser to translate between plain language and structured clinical trial searches, ensuring that a user's health information never leaves their computer.

The core promise: **your health information never leaves your device — not because we promise, but because there is nowhere for it to go.**

## Architecture

### Design Principles

- **Zero data persistence.** No database, no logs, no session storage, no cookies, no analytics of any kind.
- **No server.** The application is a static site (HTML/JS/CSS) hosted on GitHub Pages. There is no backend to compromise.
- **Local AI.** A fine-tuned, quantized language model runs in the browser via WebGPU/WebAssembly. Health information is processed on-device.
- **Minimal network calls.** The only outbound requests are structured queries to the ClinicalTrials.gov public REST API — containing only clinical terms (e.g., `condition=breast+cancer&location=New+York`), not the user's raw input.
- **Fully auditable.** The entire codebase is open source. Anyone can verify every claim about privacy.

### System Components

The application has three layers, each designed to function independently:

**Layer 1 — Structured Search (No AI Required)**
A clean, accessible form interface with dropdowns and text fields for condition, location, age, gender, phase preference, and intervention type. This layer works without any AI — it maps directly to ClinicalTrials.gov API query parameters. This is the default experience and the most trustworthy one.

**Layer 2 — Natural Language Input (Local LLM)**
An optional text box where users can describe their situation in their own words. A fine-tuned Gemma 2B model running locally in the browser via WebLLM parses the input into structured query parameters. The model performs entity extraction (conditions, biomarkers, demographics, location) and maps them to the same API parameters used by Layer 1. Users who are skeptical of AI can ignore this entirely and use the structured form.

**Layer 3 — Plain-Language Results (Local LLM)**
Raw trial data returned from ClinicalTrials.gov is passed through the local model to generate plain-language summaries. Technical eligibility criteria like "ECOG performance status 0-1" become "you need to be able to carry out daily activities without much difficulty." Phase descriptions, randomization, and intervention types are all explained in accessible language. A "show original" toggle lets users see the raw trial data alongside the simplified version for full transparency.

### Data Flow

```
User types health description
        │
        ▼
[Local Gemma 2B in browser]
        │
        ▼
Structured query parameters
(condition, location, age, etc.)
        │
        ▼
ClinicalTrials.gov Public API  ◄── only network call, contains no personal narrative
        │
        ▼
Raw trial JSON response
        │
        ▼
[Local Gemma 2B in browser]
        │
        ▼
Plain-language trial cards
displayed to user
```

### Technology Stack

- **Frontend:** React single-page application, static build, hosted on GitHub Pages
- **Local LLM:** WebLLM with fine-tuned Gemma 2B (quantized to int4), loaded from CDN and cached in browser
- **Trial Data:** ClinicalTrials.gov v2 REST API (public, no authentication required)
- **Build/Deploy:** Vite + GitHub Actions, automatic deployment on push
- **Installable:** Progressive Web App (PWA) — after first visit, the app and model are cached and can work offline (except for fetching new trial data)

### Accessibility and Inclusion

- Mobile-first responsive design — not everyone has a laptop
- Screen reader compatible (ARIA labels, semantic HTML, keyboard navigation)
- Multilingual support as a future goal — the local LLM could be fine-tuned for Spanish, Mandarin, and other languages
- Low-bandwidth friendly — the model downloads once and is cached; subsequent visits load instantly
- No account or email required — zero friction to use

## Fine-Tuning the Local Model

### Overview

The browser-deployed model is a fine-tuned Gemma 2B (or Gemma 4 1B) optimized for two narrow tasks:

1. **Input Parsing:** Extract structured clinical trial search parameters from natural language patient descriptions
2. **Output Simplification:** Rewrite raw clinical trial text (eligibility criteria, study descriptions, intervention details) into plain language accessible to a non-medical audience

Fine-tuning a small model on these constrained tasks yields much better performance than prompting a general-purpose 2B model, while keeping the model small enough to run in a browser tab on consumer hardware.

### Training Data Generation

Training data is generated entirely on local hardware to avoid API costs and keep the workflow self-contained.

**Hardware:**
- Primary: RTX 5080 (16GB VRAM) running a Q4-quantized 27B model (Gemma 2 27B or Gemma 3 27B) via llama.cpp
- Secondary: RTX 3060 Ti available for parallel generation or evaluation runs

**Source Data:**
- Bulk download of 10,000–20,000 trials from the ClinicalTrials.gov v2 API, sampled across diverse conditions, phases, locations, and intervention types
- Emphasis on conditions relevant to underserved communities (HIV/AIDS, cancers with demographic disparities, rare diseases)

**Task 1 — Input Parsing Training Pairs**

The 27B model generates synthetic patient descriptions from structured trial data, then the training pair is the description → structured output. The generation prompt instructs the 27B to create varied, realistic patient descriptions at different literacy levels and verbosity, including colloquial language, misspellings, and non-medical phrasing.

Example training pair:

```
Input:  "im a 52 yr old black woman in brooklyn, diagnosed with
         triple negative breast cancer last year, already did chemo
         but its back"

Output: {
  "condition": "triple negative breast cancer",
  "age": 52,
  "gender": "female",
  "race": "black",
  "location": "Brooklyn, NY",
  "prior_treatment": ["chemotherapy"],
  "status": "recurrent"
}
```

**Task 2 — Output Simplification Training Pairs**

The 27B model takes raw trial eligibility criteria and study descriptions and rewrites them in plain language. The generation prompt emphasizes accuracy (never misrepresent what a trial requires), completeness (don't omit important criteria), and clarity (assume a high school reading level).

Example training pair:

```
Input:  "Inclusion Criteria: Age >= 18; ECOG performance status 0-1;
         Histologically confirmed HER2-positive breast cancer;
         Measurable disease per RECIST v1.1; Adequate organ function
         as defined by: ANC >= 1500/uL, platelets >= 100,000/uL,
         total bilirubin <= 1.5x ULN"

Output: "Who can join: You must be 18 or older and able to carry out
         your normal daily activities without much difficulty. You need
         a confirmed diagnosis of HER2-positive breast cancer with
         tumors that can be measured on a scan. Your blood work needs
         to show that your liver, kidneys, and blood cell counts are
         in a healthy range — your doctor can check this with standard
         lab tests."
```

**Generation Workflow:**

1. Pull trial data from ClinicalTrials.gov API and store as JSON
2. Write generation prompts for each task (input parsing and output simplification)
3. Run the 27B model via llama.cpp in batch mode overnight on the 5080
4. Post-process outputs: validate JSON structure for Task 1, basic quality filtering for Task 2
5. Manual review of a random subset (~200 examples per task) to catch systematic errors
6. Adjust prompts and re-generate if quality issues are found
7. Target: 5,000–10,000 training pairs per task

**Quality Assurance:**

- Hold out 10% of generated data as a test set
- Generate a small "gold standard" comparison set (~200–500 examples) using a frontier model (Claude batch API, ~$10–20) to benchmark local generation quality
- Domain review leveraging institutional knowledge of clinical terminology from MSK
- Automated validation: JSON schema checks for Task 1, readability scoring (Flesch-Kincaid) for Task 2

### Fine-Tuning Process

**Method:** QLoRA (Quantized Low-Rank Adaptation)
- Keeps the base model weights frozen and trains small adapter matrices
- Dramatically reduces memory requirements — the full fine-tune runs comfortably on 16GB VRAM
- Adapter weights are small (10–50MB), making them easy to ship alongside the app

**Tools:**
- Hugging Face `transformers` + `peft` + `trl` for the training loop, or Unsloth for optimized throughput
- Base model: `google/gemma-2-2b-it` or `google/gemma-3-1b-it`(instruction-tuned variant)
- 4-bit quantization via bitsandbytes during training

**Training Configuration (Starting Point):**
- LoRA rank: 16–32
- LoRA alpha: 32–64
- Learning rate: 2e-4 with cosine schedule
- Batch size: 4–8 (gradient accumulation as needed)
- Epochs: 3–5 (monitor eval loss for early stopping)
- Training time estimate: 2–4 hours on the RTX 5080

**Multi-Task Training:**
Both tasks (input parsing and output simplification) are trained together by prepending a task identifier token to each example. This keeps a single model and single set of LoRA weights for both capabilities.

### Evaluation Framework

Evaluation is structured similarly to a RAG evaluation pipeline, with automated metrics and human review:

**Input Parsing Evaluation:**
- Exact match rate on extracted fields (condition, age, location, gender)
- Partial match scoring for conditions (did it get close even if not exact?)
- MeSH term mapping accuracy — does the extracted condition map to the correct ClinicalTrials.gov vocabulary?
- Error categorization: missed fields, hallucinated fields, misinterpreted values

**Output Simplification Evaluation:**
- Factual accuracy: does the plain-language version correctly represent the original criteria? (Scored by comparing against 27B or Claude-generated reference summaries)
- Readability: Flesch-Kincaid grade level targeting 8th grade or below
- Completeness: are important eligibility criteria preserved or dropped?
- Safety check: does the simplification ever make a trial sound more permissive than it actually is? (Critical failure mode)

**Iteration Cycle:**
1. Train → Evaluate → Identify failure categories → Generate targeted training data for those categories → Retrain
2. Each cycle can run in a single day on local hardware
3. Target 3–5 iteration cycles before initial deployment

### Browser Deployment

After fine-tuning:

1. Merge LoRA adapters into the base model
2. Quantize to int4 using the MLC-LLM or llama.cpp quantization pipeline
3. Convert to the WebLLM-compatible format (MLC weight format)
4. Host the quantized model weights on a CDN (GitHub LFS, Hugging Face Hub, or Cloudflare R2)
5. WebLLM loads the model into the browser on first visit, caches it via the Cache API (~1–2GB for a quantized 2B model)
6. Subsequent visits load the model from cache — no download needed

## Roadmap

**Phase 1 — Structured Search MVP**
Build the static site with the structured form interface (Layer 1). No AI, just a well-designed frontend that queries ClinicalTrials.gov directly. Ship it, get feedback from ACT-UP members.

**Phase 2 — Training Data Pipeline**
Pull trial data, write generation prompts, generate synthetic training data on local hardware. Build the evaluation framework.

**Phase 3 — Fine-Tune and Integrate**
Train the model, evaluate, iterate. Integrate WebLLM into the app for natural language input (Layer 2) and plain-language results (Layer 3).

**Phase 4 — Community Testing**
Share with ACT-UP members and patient advocates. Collect feedback on result quality, usability, and trust. Use feedback to generate additional training data for edge cases.

**Phase 5 — Hardening**
PWA support for offline use. Accessibility audit. Performance optimization. Multilingual fine-tuning.

## Guiding Principles

- **Trust is earned through transparency, not promises.** Open source everything. Let the architecture speak for itself.
- **The tool works without AI.** AI is an enhancement, not a requirement. Skeptical users lose nothing.
- **Medical accuracy is non-negotiable.** A misleading simplification is worse than the original jargon. When in doubt, show both.
- **Build with the community, not for them.** ACT-UP members should be collaborators, testers, and co-designers, not just end users.
- **This is information access, not medical advice.** The tool helps people find trials. Decisions happen with their doctors.
