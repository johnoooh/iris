import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Header from './components/Header'
import DedicationBanner from './components/DedicationBanner'
import PrivacyStatement from './components/PrivacyStatement'
import SearchForm from './components/SearchForm'
import NaturalLanguageInput from './components/NaturalLanguageInput'
import ResultsList from './components/ResultsList'
import Footer from './components/Footer'

const queryClient = new QueryClient()

function IrisApp() {
  const [searchParams, setSearchParams] = useState(null)

  return (
    <div className="min-h-screen bg-parchment-50 flex flex-col">
      <Header />
      <DedicationBanner />
      <PrivacyStatement />
      <main className="flex-1">
        <SearchForm onSearch={setSearchParams} />
        <NaturalLanguageInput />
        {searchParams && <ResultsList searchParams={searchParams} />}
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
