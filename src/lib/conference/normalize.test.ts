import { describe, it, expect } from 'vitest'
import { normalizeConference } from './normalize'
import type { Conference } from './types'
import { Format } from '@/lib/proposal/types'

describe('normalizeConference', () => {
  it('turns every absent required array into an empty array', () => {
    // The shape a freshly provisioned tenant produces: the projection is a bare
    // `...` spread, so fields the document does not have are simply missing.
    const conference = normalizeConference({
      _id: 'conf-1',
      title: 'Brand New Conf',
    } as Conference)

    expect(conference.formats).toEqual([])
    expect(conference.topics).toEqual([])
    expect(conference.domains).toEqual([])
    expect(conference.organizers).toEqual([])
  })

  it('leaves configured values untouched', () => {
    const formats = [Format.lightning_10, Format.workshop_120]
    const conference = normalizeConference({
      _id: 'conf-1',
      formats,
      domains: ['example.com'],
    } as Conference)

    expect(conference.formats).toBe(formats)
    expect(conference.domains).toEqual(['example.com'])
  })

  it('replaces a non-array value rather than trusting the type', () => {
    // Sanity is schemaless at read time — a legacy or hand-edited document can
    // carry a scalar where the schema says array, which would blow up on
    // `.filter` exactly like `undefined` does.
    const conference = normalizeConference({
      _id: 'conf-1',
      formats: 'lightning_10',
    } as unknown as Conference)

    expect(conference.formats).toEqual([])
  })

  it('is idempotent and returns the same object', () => {
    const input = { _id: 'conf-1' } as Conference
    const once = normalizeConference(input)
    const twice = normalizeConference(once)

    expect(twice).toBe(input)
    expect(twice.formats).toEqual([])
  })

  it('tolerates the empty unknown-host conference', () => {
    const conference = normalizeConference({} as Conference)
    expect(conference.formats).toEqual([])
    // Still an unknown host — normalising arrays must not fabricate an `_id`.
    expect(conference._id).toBeUndefined()
  })
})
