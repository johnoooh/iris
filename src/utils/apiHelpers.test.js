import { describe, it, expect } from 'vitest'
import { buildQuery } from './apiHelpers'

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

  it('uses filter.geo when coords provided', () => {
    const url = buildQuery(
      { condition: 'cancer', radius: '50' },
      { lat: 40.748, lng: -73.996 },
      null
    )
    expect(url).toContain('filter.geo=distance%2840.748%2C-73.996%29mi%3A50')
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

  it('includes filter.phase for selected phases', () => {
    const url = buildQuery({ condition: 'cancer', phases: ['PHASE2', 'PHASE3'] }, null, null)
    expect(url).toContain('filter.phase=PHASE2')
    expect(url).toContain('filter.phase=PHASE3')
  })

  it('includes filter.sex when not "ALL"', () => {
    const url = buildQuery({ condition: 'cancer', sex: 'FEMALE' }, null, null)
    expect(url).toContain('filter.sex=FEMALE')
  })

  it('omits filter.sex when "ALL"', () => {
    const url = buildQuery({ condition: 'cancer', sex: 'ALL' }, null, null)
    expect(url).not.toContain('filter.sex')
  })

  it('includes filter.age when age provided', () => {
    const url = buildQuery({ condition: 'cancer', age: 52 }, null, null)
    expect(url).toContain('filter.age=52')
  })

  it('includes pageToken when provided', () => {
    const url = buildQuery({ condition: 'cancer' }, null, 'abc123')
    expect(url).toContain('pageToken=abc123')
  })

  it('includes sort when provided', () => {
    const url = buildQuery({ condition: 'cancer', sort: 'LastUpdatePostDate:desc' }, null, null)
    expect(url).toContain('sort=LastUpdatePostDate%3Adesc')
  })
})
