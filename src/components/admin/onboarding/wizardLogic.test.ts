/**
 * Unit tests for the onboarding wizard's pure step logic (S2). Pins the gates
 * the UI renders from: per-step validation, the OPTIONAL domains contract
 * (empty list is valid), slug auto-derivation, and the final Create gate.
 */
import { describe, it, expect } from 'vitest'
import {
  WIZARD_STEPS,
  derivedSlug,
  validateOrganization,
  validateOrganizer,
  validateConference,
  domainsLocalErrors,
  domainsComplete,
  cleanDomains,
  canProceed,
  canCreate,
  type WizardState,
  type OrganizerState,
  type OrganizationState,
  type ConferenceState,
} from './wizardLogic'

const org: OrganizationState = {
  name: 'Cloud Native Oslo',
  slug: '',
  slugTouched: false,
  contactEmail: 'hello@cno.no',
  billingEmail: '',
}

const conference: ConferenceState = {
  title: 'Cloud Native Days Oslo 2027',
  city: 'Oslo',
  country: 'Norway',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}

const organizer: OrganizerState = { name: 'Kari', email: 'kari@cno.no' }

const state: WizardState = { organization: org, conference, domains: [''] }

describe('derivedSlug', () => {
  it('derives from the name until hand-edited', () => {
    expect(derivedSlug(org)).toBe('cloud-native-oslo')
    expect(derivedSlug({ ...org, slugTouched: true, slug: 'custom' })).toBe(
      'custom',
    )
  })
})

describe('validateOrganization', () => {
  it('passes a complete org', () => {
    expect(validateOrganization(org, false)).toEqual({})
  })

  it('requires name, slug and contact email', () => {
    const errs = validateOrganization(
      { ...org, name: '', contactEmail: '' },
      false,
    )
    expect(errs.name).toBeTruthy()
    expect(errs.slug).toBeTruthy() // empty name → empty derived slug
    expect(errs.contactEmail).toBeTruthy()
  })

  it('rejects malformed slugs and emails', () => {
    expect(
      validateOrganization(
        { ...org, slugTouched: true, slug: '-Bad Slug-' },
        false,
      ).slug,
    ).toBeTruthy()
    expect(
      validateOrganization({ ...org, contactEmail: 'nope' }, false)
        .contactEmail,
    ).toBeTruthy()
    expect(
      validateOrganization({ ...org, billingEmail: 'nope' }, false)
        .billingEmail,
    ).toBeTruthy()
  })

  it('layers the server slug-taken verdict on top', () => {
    expect(validateOrganization(org, true).slug).toContain('Already used')
  })
})

describe('validateOrganizer', () => {
  it('requires name and a well-formed email', () => {
    expect(validateOrganizer(organizer)).toEqual({})
    expect(validateOrganizer({ name: '', email: 'x' })).toMatchObject({
      organizerName: expect.any(String),
      organizerEmail: expect.any(String),
    })
  })
})

describe('validateConference — dates optional but paired and ordered', () => {
  it('passes with both dates or neither', () => {
    expect(validateConference(conference)).toEqual({})
    expect(
      validateConference({ ...conference, startDate: '', endDate: '' }),
    ).toEqual({})
  })

  it('requires title, city and country', () => {
    const errs = validateConference({
      ...conference,
      title: '',
      city: '',
      country: '',
    })
    expect(Object.keys(errs).sort()).toEqual(['city', 'country', 'title'])
  })

  it('rejects a lone date and a reversed range', () => {
    expect(
      validateConference({ ...conference, endDate: '' }).endDate,
    ).toBeTruthy()
    expect(
      validateConference({ ...conference, startDate: '' }).startDate,
    ).toBeTruthy()
    expect(
      validateConference({ ...conference, endDate: '2027-05-31' }).endDate,
    ).toBeTruthy()
  })
})

describe('domains — optional list', () => {
  it('accepts an entirely empty list (tenants can start on none)', () => {
    expect(domainsLocalErrors([''])).toEqual({})
    expect(domainsComplete([''], [])).toBe(true)
    expect(cleanDomains([''])).toEqual([])
  })

  it('still validates and dedupes typed entries', () => {
    expect(
      Object.keys(domainsLocalErrors(['not a hostname'])).length,
    ).toBeGreaterThan(0)
    expect(domainsComplete(['taken.example.com'], ['taken.example.com'])).toBe(
      false,
    )
  })
})

describe('step gating', () => {
  it('walks the four steps in order', () => {
    expect(WIZARD_STEPS).toEqual([
      'organization',
      'conference',
      'domains',
      'review',
    ])
  })

  it('gates each step on its own validation', () => {
    expect(canProceed('organization', state, organizer, false, [])).toBe(true)
    expect(
      canProceed(
        'organization',
        { ...state, organization: { ...org, name: '' } },
        organizer,
        false,
        [],
      ),
    ).toBe(false)
    expect(
      canProceed('organization', state, { name: '', email: '' }, false, []),
    ).toBe(false)
    expect(canProceed('conference', state, organizer, false, [])).toBe(true)
    expect(canProceed('domains', state, organizer, false, [])).toBe(true)
    expect(canProceed('review', state, organizer, false, [])).toBe(false)
  })

  it('a slug-taken verdict blocks the organization step', () => {
    expect(canProceed('organization', state, organizer, true, [])).toBe(false)
  })

  it('canCreate requires every step to be complete', () => {
    expect(canCreate(state, organizer, false, [])).toBe(true)
    expect(canCreate(state, organizer, true, [])).toBe(false)
    expect(
      canCreate(
        { ...state, conference: { ...conference, title: '' } },
        organizer,
        false,
        [],
      ),
    ).toBe(false)
    expect(
      canCreate(
        { ...state, domains: ['taken.example.com'] },
        organizer,
        false,
        ['taken.example.com'],
      ),
    ).toBe(false)
  })
})
