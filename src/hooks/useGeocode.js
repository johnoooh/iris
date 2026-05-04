import { useQuery } from '@tanstack/react-query'

async function geocode(location) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IRIS-ClinicalTrialFinder/1.0' },
  })
  if (!res.ok) throw new Error('Geocoding request failed')
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export function useGeocode(location) {
  return useQuery({
    queryKey: ['geocode', location],
    queryFn: () => geocode(location),
    enabled: Boolean(location),
    staleTime: 1000 * 60 * 60, // 1 hour — zip codes don't move
    retry: false,
  })
}
