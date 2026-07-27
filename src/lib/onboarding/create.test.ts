/**
 * Unit tests for the onboarding S1 pure document builder — the blank-start
 * tenant defaults are contractual: unlisted, registration closed, empty
 * formats/topics, comms funneled to the org contact address, and NO
 * plan/billing fields (the org schema excludes them until billing lands).
 */
import { describe, it, expect } from 'vitest'
import {
  buildOnboardingDocuments,
  slugifyOrganizationName,
  ORG_SLUG_RE,
  type OnboardingInput,
} from './create'

function input(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    organization: {
      name: 'Cloud Native Oslo',
      slug: 'cloud-native-oslo',
      contactEmail: 'hello@cno.no',
    },
    conference: {
      title: 'Cloud Native Days Oslo 2027',
      city: 'Oslo',
      country: 'Norway',
      startDate: '2027-06-01',
      endDate: '2027-06-02',
    },
    organizer: { name: 'Kari Nordmann', email: 'kari@cno.no' },
    domains: ['oslo.cloudnativedays.no'],
    ...overrides,
  }
}

let keyCounter = 0
const ids = () => ({
  organizationId: 'organization-1',
  conferenceId: 'conference-1',
  speakerId: 'speaker-1',
  mintKey: () => `key-${++keyCounter}`,
})

describe('slugifyOrganizationName', () => {
  it('normalizes punctuation, case and edge dashes', () => {
    expect(slugifyOrganizationName('  Cloud Native Oslo!  ')).toBe(
      'cloud-native-oslo',
    )
    expect(slugifyOrganizationName('--Æøå x--')).toBe('x')
    expect(ORG_SLUG_RE.test(slugifyOrganizationName('A  B__C'))).toBe(true)
  })
})

describe('buildOnboardingDocuments — organization', () => {
  it('builds the org doc with slug object and no billing email when unset', () => {
    const { organization } = buildOnboardingDocuments(input(), ids(), null)
    expect(organization).toMatchObject({
      _id: 'organization-1',
      _type: 'organization',
      name: 'Cloud Native Oslo',
      slug: { _type: 'slug', current: 'cloud-native-oslo' },
      contactEmail: 'hello@cno.no',
    })
    expect(organization).not.toHaveProperty('billingEmail')
    // NO plan/entitlement fields until the billing issue lands.
    expect(organization).not.toHaveProperty('plan')
  })

  it('carries the billing email when provided', () => {
    const { organization } = buildOnboardingDocuments(
      input({
        organization: {
          name: 'X',
          slug: 'x',
          contactEmail: 'a@b.co',
          billingEmail: 'billing@b.co',
        },
      }),
      ids(),
      null,
    )
    expect(organization.billingEmail).toBe('billing@b.co')
  })
})

describe('buildOnboardingDocuments — conference defaults', () => {
  it('is born unlisted, registration closed, org-owned, with comms defaulted', () => {
    const { conference } = buildOnboardingDocuments(input(), ids(), null)
    expect(conference).toMatchObject({
      _type: 'conference',
      title: 'Cloud Native Days Oslo 2027',
      organization: { _type: 'reference', _ref: 'organization-1' },
      organizer: 'Cloud Native Oslo',
      city: 'Oslo',
      country: 'Norway',
      startDate: '2027-06-01',
      endDate: '2027-06-02',
      contactEmail: 'hello@cno.no',
      cfpEmail: 'hello@cno.no',
      sponsorEmail: 'hello@cno.no',
      registrationEnabled: false,
      visibility: 'unlisted',
      domains: ['oslo.cloudnativedays.no'],
    })
    // Empty-safe CFP config: the activation checklist fills these later.
    expect(conference).not.toHaveProperty('formats')
    expect(conference).not.toHaveProperty('topics')
  })

  it('omits dates and domains entirely when not provided', () => {
    const { conference } = buildOnboardingDocuments(
      input({
        conference: { title: 'T', city: 'C', country: 'N' },
        domains: [],
      }),
      ids(),
      null,
    )
    expect(conference).not.toHaveProperty('startDate')
    expect(conference).not.toHaveProperty('endDate')
    expect(conference).not.toHaveProperty('domains')
  })

  it('normalizes and drops blank domains', () => {
    const { conference } = buildOnboardingDocuments(
      input({ domains: [' Oslo.Example.COM ', ''] }),
      ids(),
      null,
    )
    expect(conference.domains).toEqual(['oslo.example.com'])
  })
})

describe('buildOnboardingDocuments — organizer membership', () => {
  it('creates a speaker carrying the org membership when none exists', () => {
    const { conference, speaker } = buildOnboardingDocuments(
      input(),
      ids(),
      null,
    )
    expect(speaker).toMatchObject({
      _id: 'speaker-1',
      _type: 'speaker',
      name: 'Kari Nordmann',
      email: 'kari@cno.no',
      organizations: [
        {
          _type: 'reference',
          _ref: 'organization-1',
          _key: 'organization-1',
        },
      ],
    })
    const organizers = conference.organizers as Array<{ _ref: string }>
    expect(organizers).toHaveLength(1)
    expect(organizers[0]._ref).toBe('speaker-1')
  })

  it('references the EXISTING speaker and creates no new one when matched', () => {
    const { conference, speaker } = buildOnboardingDocuments(
      input(),
      ids(),
      'speaker-existing',
    )
    expect(speaker).toBeNull()
    const organizers = conference.organizers as Array<{
      _ref: string
      _key: string
    }>
    expect(organizers[0]._ref).toBe('speaker-existing')
    expect(organizers[0]._key).toBeTruthy()
  })
})
