import { useQuery } from '@tanstack/react-query'

// Reject geocoding hits that resolve to a whole state, country, or other
// large administrative region. Centroids of these (e.g. "California" →
// Sequoia National Forest) silently produce wilderness searches with zero
// trial sites. Better to fall back to no-location search than to pin to a
// meaningless centroid.
const REJECTED_ADDRESSTYPES = new Set(['state', 'country', 'region', 'province'])

async function geocode(location) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IRIS-ClinicalTrialFinder/1.0' },
  })
  if (!res.ok) throw new Error('Geocoding request failed')
  const data = await res.json()
  if (!data.length) return null
  const hit = data[0]
  if (REJECTED_ADDRESSTYPES.has(hit.addresstype)) return null
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }
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
