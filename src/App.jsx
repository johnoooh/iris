import { lazy, Suspense, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './components/Header'
import PrivacyStatement from './components/PrivacyStatement'
import SearchForm from './components/SearchForm'
import NaturalLanguageInput from './components/NaturalLanguageInput'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'
import { resolveModelKey } from './utils/nlpModels'

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

function getTestRoute() {
  if (typeof window === 'undefined') return null
  if (!import.meta.env.DEV) return null
  const t = new URLSearchParams(window.location.search).get('test')
  return t === 'nlp' || t === 'scenarios' ? t : null
}

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [userDescription, setUserDescription] = useState(null)

  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )

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
      <PrivacyStatement />
      <main className="flex-1 flex flex-col min-h-0">
        <NaturalLanguageInput onExtract={handleExtract} />
        <SearchForm onSearch={setSearchParams} prefill={prefill} />
        {searchParams && (
          <ResultsList
            searchParams={searchParams}
            modelKey={modelKey}
            userDescription={userDescription}
            extractedFields={prefill}
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
