/* global React */
// Shared mock data — three realistic trials that demonstrate different states:
// recruiting / streaming / completed simplification, with varying eligibility fit.

const MOCK_USER = {
  description: "I'm 58 years old with breast cancer in Boston",
  fields: { condition: 'breast cancer', location: 'Boston', age: 58, sex: 'FEMALE' },
};

const MOCK_TRIALS = [
  {
    id: 'NCT05952557',
    title: 'Phase IIIb Study of Ribociclib + ET in Early Breast Cancer',
    status: 'RECRUITING',
    phase: 'Phase 3',
    facility: 'Boston Medical Center',
    city: 'Boston',
    state: 'MA',
    distanceMi: 0.1,
    intervention: 'Ribociclib + endocrine therapy',
    enrollmentCount: 4000,
    fit: 'strong', // strong | partial | weak
    fitReason: 'HR-positive postmenopausal patients 50–65 — your description matches.',
    rawSummary:
      "This is a Phase IIIb open-label study evaluating ribociclib in combination with endocrine therapy in postmenopausal women with HR-positive, HER2-negative early breast cancer following definitive locoregional therapy.",
    rawEligibility:
      "Adult female, ≥18 years. HR-positive, HER2-negative breast cancer. Completed surgery. Postmenopausal status. ECOG 0-1. Adequate organ function. No prior CDK4/6 inhibitor.",
    plain: {
      summary:
        "This study tests if adding ribociclib (a targeted cancer drug) to standard hormone treatment helps prevent breast cancer from coming back after surgery.",
      eligibility:
        "You may qualify if you're an adult woman who's had surgery for HR-positive, HER2-negative breast cancer. You can't have taken a CDK4/6 inhibitor before.",
      fitNote:
        "This trial is looking for HR-positive, HER2-negative breast cancer after surgery. You said you're 58 with breast cancer — to know for sure, ask your oncologist whether yours is HR-positive and HER2-negative.",
    },
    contact: { phone: '+1 617-555-0142', email: 'trials@bmc.org' },
    ctGovUrl: 'https://clinicaltrials.gov/study/NCT05952557',
  },
  {
    id: 'NCT06104020',
    title: 'Sacituzumab Govitecan in Metastatic Triple-Negative Breast Cancer',
    status: 'RECRUITING',
    phase: 'Phase 2',
    facility: 'Dana-Farber Cancer Institute',
    city: 'Boston',
    state: 'MA',
    distanceMi: 1.4,
    intervention: 'Sacituzumab govitecan',
    enrollmentCount: 220,
    fit: 'partial',
    fitReason: 'TNBC subtype required — depends on your tumor profile.',
    rawSummary:
      "Phase II evaluation of sacituzumab govitecan in patients with metastatic triple-negative breast cancer who have received at least one prior line of systemic therapy.",
    rawEligibility:
      "Adult, any sex. Metastatic TNBC confirmed. Prior chemotherapy. ECOG 0-2. Measurable disease per RECIST 1.1.",
    plain: null, // streaming state — populated by app at runtime
    contact: { phone: '+1 617-555-0298', email: 'breast-trials@dfci.org' },
    ctGovUrl: 'https://clinicaltrials.gov/study/NCT06104020',
  },
  {
    id: 'NCT05887492',
    title: 'Adaptive Radiation Boost in Locally Advanced HER2+ Breast Cancer',
    status: 'RECRUITING',
    phase: 'Phase 2',
    facility: 'Massachusetts General Hospital',
    city: 'Boston',
    state: 'MA',
    distanceMi: 1.7,
    intervention: 'Adaptive radiation therapy',
    enrollmentCount: 95,
    fit: 'partial',
    fitReason: 'Requires HER2-positive subtype and prior chemo.',
    rawSummary:
      "Single-arm Phase II trial of adaptive MR-guided boost radiation in HER2-positive locally advanced breast cancer following neoadjuvant chemotherapy.",
    rawEligibility:
      "Adult female. HER2-positive breast cancer. Stage II-III. Completed neoadjuvant chemotherapy. ECOG 0-1.",
    plain: {
      summary:
        "This study tests a more precise form of radiation that adjusts in real time, for women whose breast cancer has grown into nearby tissue and is HER2-positive.",
      eligibility:
        "You may qualify if you're an adult woman with HER2-positive breast cancer that has spread to nearby tissue and you've finished chemotherapy before surgery.",
      fitNote:
        "This trial requires HER2-positive cancer specifically. If your cancer is HR-positive instead of HER2-positive, this one likely isn't a fit.",
    },
    contact: { phone: '+1 617-555-0411', email: 'rad-onc-trials@mgh.harvard.edu' },
    ctGovUrl: 'https://clinicaltrials.gov/study/NCT05887492',
  },
  {
    id: 'NCT06221340',
    title: 'Aerobic Exercise During Adjuvant Chemo for Breast Cancer Survivors',
    status: 'RECRUITING',
    phase: 'N/A',
    facility: 'Beth Israel Deaconess',
    city: 'Boston',
    state: 'MA',
    distanceMi: 2.3,
    intervention: 'Supervised aerobic exercise program',
    enrollmentCount: 180,
    fit: 'strong',
    fitReason: 'Open to most breast cancer patients in active treatment.',
    rawSummary:
      "Behavioral intervention study examining the impact of supervised aerobic exercise on chemotherapy tolerance and quality of life in breast cancer patients undergoing adjuvant treatment.",
    rawEligibility:
      "Adult, any sex. Breast cancer, any stage. Currently receiving or scheduled for adjuvant chemotherapy. Cleared by oncologist for moderate exercise.",
    plain: {
      summary:
        "This study looks at whether a supervised exercise program helps people tolerate chemotherapy better and feel more like themselves during treatment.",
      eligibility:
        "You may qualify if you have breast cancer at any stage and you're receiving (or about to start) chemotherapy after surgery, and your oncologist says exercise is safe for you.",
      fitNote:
        "This trial is broadly open — it doesn't require a specific subtype. If you're starting or in chemotherapy, it could be a fit alongside another treatment trial.",
    },
    contact: { phone: '+1 617-555-0560', email: 'exercise-study@bidmc.harvard.edu' },
    ctGovUrl: 'https://clinicaltrials.gov/study/NCT06221340',
  },
  {
    id: 'NCT05790474',
    title: 'Datopotamab Deruxtecan vs. Chemo in HR+/HER2- Breast Cancer',
    status: 'RECRUITING',
    phase: 'Phase 3',
    facility: 'Brigham and Women\u2019s Hospital',
    city: 'Boston',
    state: 'MA',
    distanceMi: 1.2,
    intervention: 'Datopotamab deruxtecan',
    enrollmentCount: 700,
    fit: 'strong',
    fitReason: 'HR-positive, HER2-low or negative — common subtype at your age.',
    rawSummary:
      "Randomized Phase III study comparing datopotamab deruxtecan (Dato-DXd) to investigator's choice chemotherapy in patients with inoperable or metastatic HR-positive, HER2-low or negative breast cancer.",
    rawEligibility:
      "Adult. HR+, HER2-low or HER2-negative breast cancer. Inoperable or metastatic. 1-2 prior chemo regimens for advanced disease. ECOG 0-1.",
    plain: {
      summary:
        "This study compares a newer antibody-drug therapy against standard chemotherapy in people with advanced HR-positive breast cancer.",
      eligibility:
        "You may qualify if you have HR-positive breast cancer that's advanced or has spread, and you've already had one or two rounds of chemotherapy for it.",
      fitNote:
        "This is for advanced or metastatic HR-positive disease that's been treated before. If your cancer is early stage or recently diagnosed, the first trial here is more likely your fit.",
    },
    contact: { phone: '+1 617-555-0823', email: 'dana-trials@bwh.harvard.edu' },
    ctGovUrl: 'https://clinicaltrials.gov/study/NCT05790474',
  },
];

// Simulate the streaming token-by-token reveal that the real app produces.
// Components opt in by passing a trial whose plain==null and calling useStreamedSimplification.
function useStreamedSimplification(trial, { delayMs = 700, charsPerTick = 4 } = {}) {
  const [state, setState] = React.useState(() => {
    if (trial.plain) return { status: 'complete', plain: trial.plain };
    return { status: 'queued', plain: { summary: '', eligibility: '', fitNote: '' } };
  });

  React.useEffect(() => {
    if (trial.plain) return;
    const target = {
      summary:
        "This study tests a newer targeted drug for triple-negative breast cancer that has spread, in patients who've already had at least one chemotherapy.",
      eligibility:
        "You may qualify if you have triple-negative breast cancer that has spread to other parts of the body, and you've had at least one round of chemotherapy already.",
      fitNote:
        "This trial is for triple-negative breast cancer that has spread. To know if it fits, you'll need to confirm your tumor's HR/HER2 status with your oncologist.",
    };
    let i = 0;
    let cancelled = false;
    const start = setTimeout(function tick() {
      if (cancelled) return;
      i += charsPerTick;
      const total = target.summary.length + target.eligibility.length + target.fitNote.length;
      const summary = target.summary.slice(0, Math.min(i, target.summary.length));
      let rest = i - target.summary.length;
      const eligibility = rest > 0 ? target.eligibility.slice(0, Math.min(rest, target.eligibility.length)) : '';
      rest = rest - target.eligibility.length;
      const fitNote = rest > 0 ? target.fitNote.slice(0, rest) : '';
      setState({ status: i >= total ? 'complete' : 'streaming', plain: { summary, eligibility, fitNote } });
      if (i < total) setTimeout(tick, 32);
    }, delayMs);
    return () => { cancelled = true; clearTimeout(start); };
  }, [trial.id]);

  return state;
}

// Status pill
function StatusPill({ status }) {
  const map = {
    RECRUITING: { bg: 'var(--signal-good-bg)', fg: 'var(--signal-good)', label: 'Recruiting' },
    NOT_YET_RECRUITING: { bg: 'var(--signal-warn-bg)', fg: 'var(--signal-warn)', label: 'Not yet recruiting' },
    COMPLETED: { bg: 'var(--p-200)', fg: 'var(--p-700)', label: 'Completed' },
  };
  const m = map[status] || map.RECRUITING;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: m.bg, color: m.fg,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '4px 10px', borderRadius: 999,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: m.fg }} />
      {m.label}
    </span>
  );
}

// Fit meter — the new differentiator. Visualizes how the patient's described
// situation maps to the trial's eligibility, using the simplifier output.
function FitMeter({ fit, size = 'md' }) {
  const map = {
    strong:  { bars: 3, label: 'Likely fit', color: 'var(--signal-good)' },
    partial: { bars: 2, label: 'May fit',     color: 'var(--signal-warn)' },
    weak:    { bars: 1, label: 'Unclear fit', color: 'var(--p-500)' },
  };
  const m = map[fit] || map.weak;
  const barH = size === 'sm' ? 6 : 9;
  const barW = size === 'sm' ? 3 : 4;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} aria-label={m.label}>
      <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>
        {[1, 2, 3].map(n => (
          <span key={n} style={{
            width: barW, height: barH * (0.5 + n * 0.25),
            background: n <= m.bars ? m.color : 'var(--p-300)',
            borderRadius: 1,
          }} />
        ))}
      </span>
      <span style={{
        fontSize: size === 'sm' ? 11 : 12,
        color: m.color, fontWeight: 600, letterSpacing: '0.01em',
      }}>{m.label}</span>
    </span>
  );
}

// Local-AI badge — front-and-center about the privacy story.
function LocalAIBadge({ active = false, label = 'Gemma 2 2B · on-device' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--iris-700)',
      background: 'var(--iris-50)', border: '1px solid var(--iris-100)',
      padding: '3px 8px', borderRadius: 999,
    }}>
      <span
        className={active ? 'iris-pulse' : ''}
        style={{
          width: 6, height: 6, borderRadius: 999,
          background: active ? 'var(--iris-500)' : 'var(--iris-300)',
        }}
      />
      {label}
    </span>
  );
}

// Header used by all variations — single, dense, with privacy chip.
function IrisHeader({ compact = false }) {
  return (
    <header style={{
      padding: compact ? '14px 24px' : '20px 28px',
      borderBottom: '1px solid var(--p-200)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{
          fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 26,
          letterSpacing: '-0.02em', color: 'var(--p-950)',
        }}>iris</span>
        <span style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic',
          color: 'var(--p-700)', fontSize: 13,
        }}>clinical trial finder</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span title="Your data never leaves the device" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--p-700)',
          fontFamily: 'var(--mono)',
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 5V3.5a3 3 0 1 1 6 0V5M2.5 5h7v5h-7z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          on-device only
        </span>
        <LocalAIBadge />
      </div>
    </header>
  );
}

// Search bar (unified) used by all variations
function IrisSearchBar({ user = MOCK_USER, dense = false }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--p-200)',
      background: 'var(--p-50)',
    }}>
      <div style={{ padding: dense ? '14px 24px' : '20px 28px 18px' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {['Describe in your words', 'Structured form'].map((m, i) => (
            <button key={m} type="button" style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500,
              background: i === 0 ? 'var(--p-100)' : 'transparent',
              color: i === 0 ? 'var(--p-950)' : 'var(--p-700)',
              border: '1px solid', borderColor: i === 0 ? 'var(--p-300)' : 'transparent',
              borderRadius: 999, cursor: 'pointer',
            }}>
              {m}
              {i === 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 10, padding: '1px 6px',
                  background: 'var(--iris-100)', color: 'var(--iris-700)',
                  borderRadius: 999, fontFamily: 'var(--mono)',
                }}>AI · on-device</span>
              )}
            </button>
          ))}
        </div>

        <div style={{
          background: 'white', border: '1px solid var(--p-300)', borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ marginTop: 2, color: 'var(--p-700)', flexShrink: 0 }}>
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ flex: 1, fontSize: 15, color: 'var(--p-900)', lineHeight: 1.4 }}>
            {user.description}
          </div>
          <button style={{
            background: 'var(--iris-600)', color: 'white',
            border: 'none', borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}>Find trials</button>
        </div>

        {/* Understood chips */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
          marginTop: 10, fontSize: 12,
        }}>
          <span style={{ color: 'var(--p-700)', fontFamily: 'var(--mono)', fontSize: 11 }}>
            understood:
          </span>
          {Object.entries({ condition: user.fields.condition, location: user.fields.location, age: user.fields.age }).map(([k, v]) => (
            <span key={k} style={{
              background: 'white', border: '1px solid var(--p-300)',
              borderRadius: 6, padding: '2px 8px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                color: 'var(--p-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{k}</span>
              <span style={{ color: 'var(--p-950)', fontWeight: 500 }}>{v}</span>
            </span>
          ))}
          <button style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: 'var(--iris-700)', fontSize: 12, cursor: 'pointer',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}>edit details</button>
        </div>
      </div>
    </div>
  );
}

// Result count + sort controls (shared)
function ResultsToolbar({ count = 20, sort = 'best-fit', onSort, extra }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 28px', borderBottom: '1px solid var(--p-200)', flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, color: 'var(--p-950)',
        }}>{count} trials</span>
        <span style={{ fontSize: 12, color: 'var(--p-700)' }}>
          near Boston · within 50 mi · recruiting
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {extra}
        <span style={{ fontSize: 12, color: 'var(--p-700)' }}>sort by</span>
        <select defaultValue={sort} onChange={e => onSort?.(e.target.value)} style={{
          background: 'white', border: '1px solid var(--p-300)', borderRadius: 6,
          padding: '4px 10px', fontSize: 12, color: 'var(--p-900)',
        }}>
          <option value="best-fit">Best fit</option>
          <option value="distance">Distance</option>
          <option value="phase">Phase</option>
          <option value="recent">Most recent</option>
        </select>
      </div>
    </div>
  );
}

// Action row — share, save, print (compare lives in toolbar)
function ActionRow({ onCompare, comparing, simple }) {
  const btn = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--p-700)', fontSize: 12, padding: '4px 6px',
    display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 6,
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button style={btn} title="Copy share link">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M5 8a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6H8M11 8a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        Share
      </button>
      <button style={btn} title="Save for later (this session)">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 3h8v11l-4-2.5L4 14V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        Save
      </button>
      <button style={btn} title="Print this trial">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 6V3h8v3M4 11H3V7h10v4h-1M5 9h6v5H5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        Print
      </button>
      {!simple && (
        <button onClick={onCompare} style={{
          ...btn,
          color: comparing ? 'var(--iris-700)' : 'var(--p-700)',
          background: comparing ? 'var(--iris-50)' : 'transparent',
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" /><rect x="9" y="3" width="5" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" /></svg>
          {comparing ? 'In compare' : 'Compare'}
        </button>
      )}
    </div>
  );
}

// Streaming text with shimmer placeholder
function StreamingText({ value, status, placeholderLines = 2 }) {
  if (status === 'queued') {
    // Rendered inside <p> in some call sites — keep everything inline-level.
    return (
      <span style={{ display: 'inline' }}>
        {Array.from({ length: placeholderLines }).map((_, i) => (
          <span
            key={i}
            className="iris-shimmer-text"
            style={{
              display: 'block',
              height: 14,
              width: i === placeholderLines - 1 ? '70%' : '100%',
              marginTop: i === 0 ? 0 : 6,
            }}
          >&nbsp;</span>
        ))}
      </span>
    );
  }
  return (
    <span className="iris-fadein" style={{ whiteSpace: 'pre-wrap' }}>
      {value}
      {status === 'streaming' && (
        <span style={{
          display: 'inline-block', width: 7, height: 14, marginLeft: 2,
          background: 'var(--iris-500)', verticalAlign: 'text-bottom',
          animation: 'iris-pulse 1s ease-in-out infinite',
        }} />
      )}
    </span>
  );
}

Object.assign(window, {
  MOCK_USER, MOCK_TRIALS, useStreamedSimplification,
  StatusPill, FitMeter, LocalAIBadge, IrisHeader, IrisSearchBar,
  ResultsToolbar, ActionRow, StreamingText,
});
