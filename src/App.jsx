import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './components/Header'
import UnifiedSearchBar from './components/UnifiedSearchBar'
import ResultsList from './components/ResultsList'
import CompareView from './components/CompareView'
import Footer from './components/Footer'
import { resolveModelKey } from './utils/nlpModels'
import { useHashRoute } from './hooks/useHashRoute'

const COMPARE_LIMIT = 3

const queryClient = new QueryClient()

// Dev-only test harnesses. Both lazy() calls are gated on import.meta.env.DEV
// so the entire panel modules (test prompts, UI, scenario runner) are dead
// code in production builds and get tree-shaken out of dist/. Confirmed by
// grepping the prod bundle.
const NLPTestPanel = import.meta.env.DEV
  ? lazy(() => import('./components/NLPTestPanel'))
  : null
const ProdScenarioTestPanel = import.meta.env.DEV
  ? lazy(() => import('./components/ProdScenarioTestPanel'))
  : null
const ClassificationHarness = import.meta.env.DEV
  ? lazy(() => import('./components/ClassificationHarness'))
  : null

function getTestRoute() {
  if (typeof window === 'undefined') return null
  if (!import.meta.env.DEV) return null
  const t = new URLSearchParams(window.location.search).get('test')
  return t === 'nlp' || t === 'scenarios' || t === 'classify' ? t : null
}

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [userDescription, setUserDescription] = useState(null)

  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )

  // ─── Compare selection (lifted from ResultsList) ──────────────────
  // Lives at App level so it survives search refinements (each new
  // search re-mounts ResultsList, which would have wiped local state).
  // pinnedTrials is a parallel cache of the full trial objects keyed
  // by NCT ID — needed because a previously-pinned trial may not appear
  // in the current result set, but the compare view still needs to
  // render it. Cache is in-memory only (no localStorage) per the
  // privacy promise.
  const [compareSet, setCompareSet] = useState(() => new Set())
  const pinnedTrialsRef = useRef(new Map())

  const toggleCompare = useCallback((trial) => {
    if (!trial?.nctId) return
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(trial.nctId)) {
        next.delete(trial.nctId)
      } else if (next.size < COMPARE_LIMIT) {
        next.add(trial.nctId)
        // Populate the cache the moment a trial is pinned so the
        // compare view has the data even after the user refines
        // their search and the result set no longer contains it.
        pinnedTrialsRef.current.set(trial.nctId, trial)
      }
      return next
    })
  }, [])

  const clearCompare = useCallback(() => {
    setCompareSet(new Set())
    pinnedTrialsRef.current.clear()
  }, [])

  const removeFromCompare = useCallback((nctId) => {
    setCompareSet(prev => {
      const next = new Set(prev)
      next.delete(nctId)
      return next
    })
    pinnedTrialsRef.current.delete(nctId)
  }, [])

  const { route, navigate } = useHashRoute()
  if (route === '/compare') {
    return (
      <CompareView
        compareSet={compareSet}
        pinnedTrials={pinnedTrialsRef.current}
        onBack={() => navigate('/')}
        onRemove={removeFromCompare}
      />
    )
  }

  const testRoute = getTestRoute()
  if (testRoute === 'nlp' && NLPTestPanel) {
    return (
      <div className="min-h-screen bg-parchment-50">
        <Suspense fallback={<div className="p-6 text-sm">Loading test panel…</div>}>
          <NLPTestPanel />
        </Suspense>
      </div>
    )
  }
  if (testRoute === 'classify' && ClassificationHarness) {
    return (
      <div className="min-h-screen bg-parchment-50">
        <Suspense fallback={<div className="p-6 text-sm">Loading classification harness…</div>}>
          <ClassificationHarness />
        </Suspense>
      </div>
    )
  }
  if (testRoute === 'scenarios' && ProdScenarioTestPanel) {
    // ProdScenarioTestPanel calls fetch directly, so it doesn't need a query
    // client. IrisApp is already inside the App() QueryClientProvider, so no
    // additional wrapping is required here.
    return (
      <div className="min-h-screen bg-parchment-50">
        <Suspense fallback={<div className="p-6 text-sm">Loading test panel…</div>}>
          <ProdScenarioTestPanel />
        </Suspense>
      </div>
    )
  }

  function handleExtract({ fields, description }) {
    setPrefill(fields)
    setUserDescription(description)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col min-h-0">
        <UnifiedSearchBar
          onExtract={handleExtract}
          onSearch={setSearchParams}
          prefill={prefill}
        />
        {searchParams && (
          <ResultsList
            searchParams={searchParams}
            modelKey={modelKey}
            userDescription={userDescription}
            extractedFields={prefill}
            compareSet={compareSet}
            compareLimit={COMPARE_LIMIT}
            onToggleCompare={toggleCompare}
            onClearCompare={clearCompare}
            onRemoveFromCompare={removeFromCompare}
          />
        )}
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IrisApp />
    </QueryClientProvider>
  )
}
