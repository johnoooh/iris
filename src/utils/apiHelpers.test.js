import { describe, it, expect } from 'vitest'
import { buildQuery, parseTrials, formatTitle, nearestLocation } from './apiHelpers'

const BASE = 'https://clinicaltrials.gov/api/v2/studies'

describe('buildQuery', () => {
  it('includes condition as query.cond', () => {
    const url = buildQuery({ condition: 'breast cancer' }, null, null)
    expect(url).toContain('query.cond=breast+cancer')
    expect(url).toContain(BASE)
  })

  it('includes pageSize=10', () => {
    const url = buildQuery({ condition: 'cancer' }, null, null)
    expect(url).toContain('pageSize=10')
  })

  it('requests countTotal=true so the response includes totalCount', () => {
    const url = buildQuery({ condition: 'cancer' }, null, null)
    expect(url).toContain('countTotal=true')
  })

  it('uses filter.geo when coords provided', () => {
    const url = buildQuery(
      { condition: 'cancer', radius: '50' },
      { lat: 40.748, lng: -73.996 },
      null
    )
    expect(url).toContain('filter.geo=distance%2840.748%2C-73.996%2C50mi%29')
  })

  it('falls back to query.locn when coords null but location provided', () => {
    const url = buildQuery({ condition: 'cancer', location: 'Boston MA' }, null, null)
    expect(url).toContain('query.locn=Boston+MA')
    expect(url).not.toContain('filter.geo')
  })

  it('omits location params when no location and no coords', () => {
    const url = buildQuery({ condition: 'cancer' }, null, null)
    expect(url).not.toContain('locn')
    expect(url).not.toContain('filter.geo')
  })

  it('includes filter.overallStatus when recruiting status set', () => {
    const url = buildQuery({ condition: 'cancer', status: 'RECRUITING' }, null, null)
    expect(url).toContain('filter.overallStatus=RECRUITING')
  })

  it('includes phases via aggFilters', () => {
    const url = buildQuery({ condition: 'cancer', phases: ['PHASE2', 'PHASE3'] }, null, null)
    expect(url).toContain('aggFilters=phase%3A2%2Cphase%3A3')
  })

  it('includes sex via aggFilters when not "ALL"', () => {
    const url = buildQuery({ condition: 'cancer', sex: 'FEMALE' }, null, null)
    expect(url).toContain('aggFilters=sex%3Af')
  })

  it('combines sex and phases in a single aggFilters value', () => {
    const url = buildQuery(
      { condition: 'cancer', sex: 'MALE', phases: ['PHASE1', 'PHASE2'] },
      null,
      null
    )
    expect(url).toContain('aggFilters=sex%3Am%2Cphase%3A1%2Cphase%3A2')
  })

  it('omits aggFilters when sex is "ALL" and no phases', () => {
    const url = buildQuery({ condition: 'cancer', sex: 'ALL' }, null, null)
    expect(url).not.toContain('aggFilters')
  })

  it('includes age via filter.advanced Essie expression', () => {
    const url = buildQuery({ condition: 'cancer', age: 52 }, null, null)
    expect(url).toContain('filter.advanced=')
    expect(url).toContain('MinimumAge')
    expect(url).toContain('MaximumAge')
    expect(url).toContain('52+years')
  })

  it('includes pageToken when provided', () => {
    const url = buildQuery({ condition: 'cancer' }, null, 'abc123')
    expect(url).toContain('pageToken=abc123')
  })

  it('includes sort when an explicit non-relevance value is provided', () => {
    const url = buildQuery({ condition: 'cancer', sort: 'LastUpdatePostDate:desc' }, null, null)
    expect(url).toContain('sort=LastUpdatePostDate%3Adesc')
  })

  it('omits sort when value is "relevance" (the API default)', () => {
    const url = buildQuery({ condition: 'cancer', sort: 'relevance' }, null, null)
    expect(url).not.toContain('sort=')
  })

  it('throws when condition is missing', () => {
    expect(() => buildQuery({}, null, null)).toThrow('buildQuery: params.condition is required')
  })

  it('omits filter.geo when radius is "anywhere"', () => {
    const url = buildQuery(
      { condition: 'cancer', radius: 'anywhere' },
      { lat: 40.748, lng: -73.996 },
      null
    )
    expect(url).not.toContain('filter.geo')
  })

  it('omits filter.overallStatus when status is "ALL"', () => {
    const url = buildQuery({ condition: 'cancer', status: 'ALL' }, null, null)
    expect(url).not.toContain('filter.overallStatus')
  })
})

const mockStudy = {
  protocolSection: {
    identificationModule: { nctId: 'NCT001', briefTitle: 'A STUDY OF DRUG X IN ADULTS' },
    statusModule: { overallStatus: 'RECRUITING' },
    descriptionModule: { briefSummary: 'Tests drug X.' },
    designModule: { phases: ['PHASE2'] },
    eligibilityModule: { minimumAge: '18 Years', maximumAge: 'N/A', sex: 'ALL' },
    armsInterventionsModule: { interventions: [{ type: 'DRUG', name: 'Drug X' }] },
    contactsLocationsModule: {
      centralContacts: [{ phone: '555-1234', email: 'a@b.com' }],
      locations: [
        { facility: 'Site A', city: 'Boston', state: 'Massachusetts', country: 'United States', geoPoint: { lat: 42.36, lon: -71.06 } },
        { facility: 'Site B', city: 'New York', state: 'New York', country: 'United States', geoPoint: { lat: 40.71, lon: -74.01 } },
      ],
    },
  },
}

describe('parseTrials', () => {
  it('maps nctId, status, phases, summary', () => {
    const [trial] = parseTrials([mockStudy])
    expect(trial.nctId).toBe('NCT001')
    expect(trial.status).toBe('RECRUITING')
    expect(trial.phases).toEqual(['PHASE2'])
    expect(trial.summary).toBe('Tests drug X.')
  })

  it('maps contact phone and email', () => {
    const [trial] = parseTrials([mockStudy])
    expect(trial.contact.phone).toBe('555-1234')
    expect(trial.contact.email).toBe('a@b.com')
  })

  it('maps locations array', () => {
    const [trial] = parseTrials([mockStudy])
    expect(trial.locations).toHaveLength(2)
    expect(trial.locations[0].facility).toBe('Site A')
  })

  it('returns empty array for empty input', () => {
    expect(parseTrials([])).toEqual([])
  })

  it('handles missing optional modules gracefully', () => {
    const minimal = {
      protocolSection: {
        identificationModule: { nctId: 'NCT002', briefTitle: 'Minimal' },
        statusModule: { overallStatus: 'COMPLETED' },
      },
    }
    const [trial] = parseTrials([minimal])
    expect(trial.nctId).toBe('NCT002')
    expect(trial.phases).toEqual([])
    expect(trial.locations).toEqual([])
    expect(trial.contact).toEqual({})
  })
})

describe('formatTitle', () => {
  it('lowercases all-caps words except acronyms', () => {
    expect(formatTitle('A STUDY OF DRUG X IN ADULTS WITH CANCER')).toBe(
      'A Study of Drug X in Adults With Cancer'
    )
  })

  it('returns original if already reasonable', () => {
    expect(formatTitle('Pembrolizumab in Breast Cancer')).toBe('Pembrolizumab in Breast Cancer')
  })
})

describe('nearestLocation', () => {
  const locations = [
    { facility: 'Boston Site', city: 'Boston', state: 'Massachusetts', geoPoint: { lat: 42.36, lon: -71.06 } },
    { facility: 'NY Site', city: 'New York', state: 'New York', geoPoint: { lat: 40.71, lon: -74.01 } },
  ]

  it('returns closest location and distance in miles', () => {
    // User is in New York
    const result = nearestLocation(locations, { lat: 40.748, lng: -73.996 })
    expect(result.facility).toBe('NY Site')
    expect(result.distanceMi).toBeCloseTo(3, 0)
  })

  it('returns null when no locations', () => {
    expect(nearestLocation([], { lat: 40.748, lng: -73.996 })).toBeNull()
  })

  it('returns null when coords null', () => {
    expect(nearestLocation(locations, null)).toBeNull()
  })
})
