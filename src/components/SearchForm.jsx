import { useState, useEffect } from 'react'

const PHASES = [
  { value: 'PHASE1', label: 'Phase 1' },
  { value: 'PHASE2', label: 'Phase 2' },
  { value: 'PHASE3', label: 'Phase 3' },
  { value: 'PHASE4', label: 'Phase 4' },
]

const RADII = ['25', '50', '100', '200']

export default function SearchForm({ onSearch, prefill }) {
  const [condition, setCondition] = useState('')
  const [location, setLocation] = useState('')
  const [radius, setRadius] = useState('50')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('ALL')
  const [status, setStatus] = useState('RECRUITING')
  const [phases, setPhases] = useState([])
  const [prefillKeys, setPrefillKeys] = useState(new Set())

  useEffect(() => {
    if (!prefill) return
    const keys = new Set()
    if (prefill.condition) { setCondition(prefill.condition); keys.add('condition') }
    if (prefill.location) { setLocation(prefill.location); keys.add('location') }
    if (prefill.age != null) { setAge(String(prefill.age)); keys.add('age') }
    if (prefill.sex) { setSex(prefill.sex); keys.add('sex') }
    if (prefill.status) { setStatus(prefill.status); keys.add('status') }
    if (prefill.phases?.length) { setPhases(prefill.phases); keys.add('phases') }
    setPrefillKeys(keys)
  }, [prefill])

  function togglePhase(value) {
    setPhases(prev =>
      prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]
    )
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!condition.trim()) return
    onSearch({
      condition: condition.trim(),
      location: location.trim() || null,
      radius: location.trim() ? radius : null,
      age: age ? parseInt(age, 10) : null,
      sex,
      status,
      phases,
      sort: 'relevance',
    })
  }

  function inputClass(key) {
    const base = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-parchment-800'
    return prefillKeys.has(key)
      ? `${base} border-parchment-700 bg-parchment-100`
      : `${base} border-parchment-400 bg-white`
  }

  return (
    <form onSubmit={handleSubmit} className="bg-parchment-50 border-b border-parchment-300 px-6 py-6">
      <h2 className="text-base font-semibold text-parchment-950 mb-4">Find clinical trials</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div className="lg:col-span-2">
          <label htmlFor="condition" className="block text-xs font-medium text-parchment-900 mb-1">
            Condition or disease <span aria-hidden="true">*</span>
          </label>
          <input
            id="condition"
            type="text"
            required
            value={condition}
            onChange={e => { setCondition(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('condition'); return n }) }}
            placeholder="e.g. breast cancer"
            className={inputClass('condition')}
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-xs font-medium text-parchment-900 mb-1">
            Location
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={e => { setLocation(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('location'); return n }) }}
            placeholder="City, state, or zip"
            className={inputClass('location')}
          />
        </div>

        {location.trim() && (
          <div>
            <label htmlFor="radius" className="block text-xs font-medium text-parchment-900 mb-1">
              Radius
            </label>
            <select
              id="radius"
              value={radius}
              onChange={e => setRadius(e.target.value)}
              className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
            >
              {RADII.map(r => (
                <option key={r} value={r}>{r} mi</option>
              ))}
              <option value="anywhere">Anywhere</option>
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label htmlFor="age" className="block text-xs font-medium text-parchment-900 mb-1">
            Age
          </label>
          <input
            id="age"
            type="number"
            min={0}
            max={120}
            value={age}
            onChange={e => { setAge(e.target.value); setPrefillKeys(k => { const n = new Set(k); n.delete('age'); return n }) }}
            placeholder="e.g. 52"
            className={inputClass('age')}
          />
        </div>

        <div>
          <label htmlFor="sex" className="block text-xs font-medium text-parchment-900 mb-1">
            Gender
          </label>
          <select
            id="sex"
            value={sex}
            onChange={e => setSex(e.target.value)}
            className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
          >
            <option value="ALL">Any</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </div>

        <div>
          <label htmlFor="status" className="block text-xs font-medium text-parchment-900 mb-1">
            Recruitment status
          </label>
          <select
            id="status"
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full border border-parchment-400 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-parchment-800"
          >
            <option value="RECRUITING">Recruiting</option>
            <option value="NOT_YET_RECRUITING">Not yet recruiting</option>
            <option value="ALL">All</option>
          </select>
        </div>

        <div>
          <fieldset>
            <legend className="block text-xs font-medium text-parchment-900 mb-1">Phase</legend>
            <div className="flex flex-wrap gap-3">
              {PHASES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1 text-sm text-parchment-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={phases.includes(value)}
                    onChange={() => togglePhase(value)}
                    className="accent-parchment-800"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <button
        type="submit"
        className="bg-parchment-800 text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-parchment-950 focus:outline-none focus:ring-2 focus:ring-parchment-950 transition-colors"
      >
        Search trials
      </button>
    </form>
  )
}
