const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies'

export function buildQuery(params, coords, pageToken) {
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

  if (params.age) {
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
