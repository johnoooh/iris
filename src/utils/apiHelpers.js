const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies'

export function buildQuery(params, coords, pageToken) {
  if (!params.condition) {
    throw new Error('buildQuery: params.condition is required')
  }

  const p = new URLSearchParams()

  p.set('query.cond', params.condition)
  p.set('pageSize', '10')

  if (coords && params.radius && params.radius !== 'anywhere') {
    p.set('filter.geo', `distance(${coords.lat},${coords.lng})mi:${params.radius}`)
  } else if (params.location) {
    p.set('query.locn', params.location)
  }

  if (params.status && params.status !== 'ALL') {
    p.set('filter.overallStatus', params.status)
  }

  if (params.phases && params.phases.length > 0) {
    params.phases.forEach(phase => p.append('filter.phase', phase))
  }

  if (params.sex && params.sex !== 'ALL') {
    p.set('filter.sex', params.sex)
  }

  if (params.age != null) {
    p.set('filter.age', String(params.age))
  }

  if (params.sort) {
    p.set('sort', params.sort)
  }

  if (pageToken) {
    p.set('pageToken', pageToken)
  }

  return `${CT_BASE}?${p.toString()}`
}

// Haversine distance in miles between two lat/lng points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8 // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestLocation(locations, coords) {
  if (!coords || !locations.length) return null
  let nearest = null
  let minDist = Infinity
  for (const loc of locations) {
    if (!loc.geoPoint) continue
    const d = haversineDistance(coords.lat, coords.lng, loc.geoPoint.lat, loc.geoPoint.lon)
    if (d < minDist) {
      minDist = d
      nearest = { ...loc, distanceMi: Math.round(d * 10) / 10 }
    }
  }
  return nearest
}

export function formatTitle(raw) {
  const LOWER_WORDS = new Set(['of', 'in', 'a', 'an', 'the', 'and', 'or', 'for', 'to'])
  // Detect if the title is mostly uppercase (needs conversion)
  const upperCount = (raw.match(/[A-Z]/g) || []).length
  const lowerCount = (raw.match(/[a-z]/g) || []).length
  const isMostlyUpper = upperCount > lowerCount
  const words = raw.split(' ')
  return words
    .map((word, i) => {
      const clean = word.replace(/[^A-Za-z]/g, '')
      const lower = clean.toLowerCase()
      if (isMostlyUpper) {
        // In all-caps titles: preserve single-letter words (drug letters like X, Y) as-is
        if (/^[A-Z]$/.test(clean)) return word
        if (i !== 0 && LOWER_WORDS.has(lower)) return word.toLowerCase()
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      }
      // In mixed-case titles: keep as-is (already reasonable)
      return word
    })
    .join(' ')
}

export function parseTrials(studies) {
  return studies.map(study => {
    const p = study.protocolSection ?? {}
    const id = p.identificationModule ?? {}
    const status = p.statusModule ?? {}
    const desc = p.descriptionModule ?? {}
    const design = p.designModule ?? {}
    const elig = p.eligibilityModule ?? {}
    const arms = p.armsInterventionsModule ?? {}
    const contacts = p.contactsLocationsModule ?? {}
    const centralContacts = contacts.centralContacts ?? []
    const locations = (contacts.locations ?? []).map(loc => ({
      facility: loc.facility ?? '',
      city: loc.city ?? '',
      state: loc.state ?? '',
      country: loc.country ?? '',
      geoPoint: loc.geoPoint ?? null,
    }))

    return {
      nctId: id.nctId ?? '',
      title: formatTitle(id.briefTitle ?? id.officialTitle ?? ''),
      status: status.overallStatus ?? '',
      phases: design.phases ?? [],
      summary: desc.briefSummary ?? '',
      eligibility: {
        minAge: elig.minimumAge ?? null,
        maxAge: elig.maximumAge ?? null,
        sex: elig.sex ?? 'ALL',
        criteria: elig.eligibilityCriteria ?? '',
      },
      interventions: (arms.interventions ?? []).map(i => ({ type: i.type, name: i.name })),
      contact: centralContacts[0]
        ? {
            name: centralContacts[0].name,
            phone: centralContacts[0].phone,
            email: centralContacts[0].email,
          }
        : {},
      locations,
      ctGovUrl: `https://clinicaltrials.gov/study/${id.nctId}`,
    }
  })
}
