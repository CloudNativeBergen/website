import { describe, it, expect } from 'vitest'
import {
  deriveCompany,
  stripCompanyFromTitle,
  deriveExpertise,
  computeSpeakerData,
} from './promotion'
import { Format } from '@/lib/proposal/types'
import type { SpeakerWithTalks } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

const talk = (format: Format): ProposalExisting =>
  ({ format }) as unknown as ProposalExisting

const speaker = (overrides: Partial<SpeakerWithTalks>): SpeakerWithTalks =>
  ({
    _id: 'id',
    _rev: '1',
    _createdAt: '',
    _updatedAt: '',
    name: 'Test Speaker',
    email: 'test@example.com',
    ...overrides,
  }) as SpeakerWithTalks

describe('deriveCompany', () => {
  it('returns undefined when no title', () => {
    expect(deriveCompany(undefined)).toBeUndefined()
    expect(deriveCompany('')).toBeUndefined()
  })

  it('extracts company after " at "', () => {
    expect(deriveCompany('Senior Engineer at Acme')).toBe('Acme')
  })

  it('extracts company after "@"', () => {
    expect(deriveCompany('Developer @ Acme')).toBe('Acme')
  })

  it('trims trailing detail after a separator', () => {
    expect(deriveCompany('Engineer at Acme | DevRel')).toBe('Acme')
    expect(deriveCompany('Engineer at Acme, Norway')).toBe('Acme')
  })

  it('returns undefined when the title has no affiliation marker', () => {
    expect(deriveCompany('Independent Consultant')).toBeUndefined()
  })
})

describe('stripCompanyFromTitle', () => {
  it('removes a trailing "at Company" fragment', () => {
    expect(stripCompanyFromTitle('Senior Engineer at Acme', 'Acme')).toBe(
      'Senior Engineer',
    )
  })

  it('removes a trailing "@ Company" fragment case-insensitively', () => {
    expect(stripCompanyFromTitle('Developer @ ACME', 'acme')).toBe('Developer')
  })

  it('leaves the title untouched when company is absent', () => {
    expect(stripCompanyFromTitle('Independent Consultant', undefined)).toBe(
      'Independent Consultant',
    )
  })
})

describe('deriveExpertise', () => {
  it('returns [] for empty talks', () => {
    expect(deriveExpertise([])).toEqual([])
    expect(deriveExpertise(undefined)).toEqual([])
  })

  it('collects distinct format labels', () => {
    const result = deriveExpertise([
      talk(Format.presentation_45),
      talk(Format.presentation_45),
      talk(Format.workshop_120),
    ])
    // Two distinct formats -> two distinct labels (duplicates collapsed).
    expect(result).toHaveLength(2)
    expect(new Set(result).size).toBe(2)
    result.forEach((label) => expect(typeof label).toBe('string'))
  })
})

describe('computeSpeakerData', () => {
  it('flags workshops from talk formats', () => {
    const data = computeSpeakerData(
      speaker({ talks: [talk(Format.workshop_240)] }),
    )
    expect(data.hasWorkshop).toBe(true)
    expect(data.talkCount).toBe(1)
  })

  it('does not flag a workshop for non-workshop talks', () => {
    const data = computeSpeakerData(
      speaker({ talks: [talk(Format.presentation_25)] }),
    )
    expect(data.hasWorkshop).toBe(false)
  })

  it('derives the company from the speaker title', () => {
    const data = computeSpeakerData(
      speaker({ title: 'Principal Engineer at Acme' }),
    )
    expect(data.company).toBe('Acme')
  })

  it('handles a speaker with no talks and no title', () => {
    const data = computeSpeakerData(speaker({}))
    expect(data.talkCount).toBe(0)
    expect(data.hasWorkshop).toBe(false)
    expect(data.company).toBeUndefined()
    expect(data.expertise).toEqual([])
  })
})
