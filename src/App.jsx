import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './components/Header'
import DedicationBanner from './components/DedicationBanner'
import PrivacyStatement from './components/PrivacyStatement'
import SearchForm from './components/SearchForm'
import NaturalLanguageInput from './components/NaturalLanguageInput'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'
import { resolveModelKey } from './utils/nlpModels'

const queryClient = new QueryClient()

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [userDescription, setUserDescription] = useState(null)

  const [modelKey] = useState(() =>
    resolveModelKey(typeof window !== 'undefined' ? window.location.search : '')
  )

  function handleExtract({ fields, description }) {
    setPrefill(fields)
    setUserDescription(description)
  }

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <Header />
      <DedicationBanner />
      <PrivacyStatement />
      <main className="flex-1">
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
