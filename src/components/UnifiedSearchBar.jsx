import { useState } from 'react'
import NaturalLanguageInput from './NaturalLanguageInput'
import SearchForm from './SearchForm'

const MODES = [
  { id: 'nl', label: 'Describe in your own words', badge: 'AI · on-device' },
  { id: 'form', label: 'Structured form' },
]

export default function UnifiedSearchBar({ onExtract, onSearch, prefill }) {
  // When NL extraction succeeds we auto-flip to the structured form so the
  // user can verify / edit the prefilled fields before searching.
  const [mode, setMode] = useState('nl')

  function handleExtract(payload) {
    onExtract(payload)
    setMode('form')
  }

  return (
    <div className="bg-parchment-50 border-b border-parchment-200">
      <div
        className="px-4 sm:px-7 pt-4 pb-1 flex flex-wrap gap-1"
        role="tablist"
        aria-label="Search input mode"
      >
        {MODES.map(m => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`search-panel-${m.id}`}
              id={`search-tab-${m.id}`}
              onClick={() => setMode(m.id)}
              className={[
                'inline-flex items-center gap-2 text-[12px] font-medium rounded-full px-3 py-1.5 transition-colors',
                active
                  ? 'bg-parchment-100 text-parchment-950 border border-parchment-300'
                  : 'text-parchment-700 hover:text-parchment-950 hover:bg-parchment-100 border border-transparent',
              ].join(' ')}
            >
              <span>{m.label}</span>
              {m.badge && (
                <span
                  className={[
                    'font-mono text-[10px] px-1.5 py-px rounded-full',
                    active ? 'bg-iris-100 text-iris-700' : 'bg-parchment-200 text-parchment-700',
                  ].join(' ')}
                >
                  {m.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        id="search-panel-nl"
        role="tabpanel"
        aria-labelledby="search-tab-nl"
        hidden={mode !== 'nl'}
      >
        {mode === 'nl' && <NaturalLanguageInput onExtract={handleExtract} embedded />}
      </div>
      <div
        id="search-panel-form"
        role="tabpanel"
        aria-labelledby="search-tab-form"
        hidden={mode !== 'form'}
      >
        {mode === 'form' && (
          <SearchForm onSearch={onSearch} prefill={prefill} embedded />
        )}
      </div>
    </div>
  )
}
