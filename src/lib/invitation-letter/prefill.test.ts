import { describe, it, expect } from 'vitest'
import {
  hasInvitationPrefill,
  invitationLetterHref,
  parseInvitationPrefill,
} from './prefill'

describe('parseInvitationPrefill', () => {
  it('reads the fields a ticket can contribute', () => {
    expect(
      parseInvitationPrefill({
        name: 'Amina Yusuf',
        email: 'amina@example.com',
        ref: '88912',
        org: 'Example Bank Ltd',
        title: 'Software Engineer',
      }),
    ).toEqual({
      fullName: 'Amina Yusuf',
      email: 'amina@example.com',
      registrationReference: '88912',
      organization: 'Example Bank Ltd',
      jobTitle: 'Software Engineer',
    })
  })

  it('never seeds anything a consulate checks against the passport', () => {
    const prefill = parseInvitationPrefill({
      name: 'Amina Yusuf',
      dateOfBirth: '1990-04-12',
      passportNumber: 'A1234567',
      nationality: 'Kenyan',
    })

    expect(Object.keys(prefill)).toEqual(['fullName'])
  })

  it('survives a URL with nothing useful in it', () => {
    expect(parseInvitationPrefill({})).toEqual({})
    expect(parseInvitationPrefill(undefined)).toEqual({})
    expect(hasInvitationPrefill(parseInvitationPrefill({}))).toBe(false)
  })

  it('drops values that could not have come from a ticket', () => {
    expect(
      parseInvitationPrefill({
        name: 'x'.repeat(201),
        email: 'not-an-email',
        title: 'y'.repeat(121),
      }),
    ).toEqual({})
  })

  it('tidies copy/paste artefacts instead of rejecting them', () => {
    expect(
      parseInvitationPrefill({
        name: '  Amina   Yusuf \n',
        email: ' amina@example.com ',
      }),
    ).toEqual({ fullName: 'Amina Yusuf', email: 'amina@example.com' })
  })

  it('strips control characters that would travel into the PDF verbatim', () => {
    expect(parseInvitationPrefill({ name: 'Amina\u0000\u001bYusuf' })).toEqual({
      fullName: 'Amina Yusuf',
    })
  })

  it('refuses a header-injecting email outright', () => {
    expect(
      parseInvitationPrefill({
        email: 'amina@example.com\r\nBcc: attacker@example.com',
      }).email,
    ).toBeUndefined()
  })

  it('takes the first value when a parameter is repeated', () => {
    expect(
      parseInvitationPrefill({ name: ['Amina Yusuf', 'Someone Else'] })
        .fullName,
    ).toBe('Amina Yusuf')
  })

  it('ignores non-string junk rather than throwing', () => {
    expect(() =>
      parseInvitationPrefill({
        name: [] as unknown as string[],
        email: undefined,
      }),
    ).not.toThrow()
  })
})

describe('invitationLetterHref', () => {
  it('round-trips through the parser', () => {
    const prefill = {
      fullName: 'Chen Wei',
      email: 'chen@example.com',
      registrationReference: '4471',
      organization: 'Example GmbH',
      jobTitle: 'Platform Engineer',
    }

    const href = invitationLetterHref(prefill)
    const params = Object.fromEntries(
      new URL(href, 'https://example.com').searchParams,
    )

    expect(parseInvitationPrefill(params)).toEqual(prefill)
  })

  it('links to the bare form when there is nothing to carry', () => {
    expect(invitationLetterHref({})).toBe('/admin/invitations')
  })

  it('escapes values rather than letting them break the URL', () => {
    const href = invitationLetterHref({ fullName: 'A&B =? #x' })
    expect(href).not.toContain(' ')
    expect(new URL(href, 'https://example.com').searchParams.get('name')).toBe(
      'A&B =? #x',
    )
  })
})

describe('the speaker seed', () => {
  it('carries the speaker id and role a speaker-side link adds', () => {
    expect(
      parseInvitationPrefill({
        name: 'Amina Yusuf',
        speaker: 'speaker-abc123',
        role: 'speaker',
      }),
    ).toEqual({
      fullName: 'Amina Yusuf',
      speakerId: 'speaker-abc123',
      role: 'speaker',
    })
  })

  it('keeps a draft id, which is a real document id', () => {
    expect(
      parseInvitationPrefill({ speaker: 'drafts.speaker-abc123' }).speakerId,
    ).toBe('drafts.speaker-abc123')
  })

  // A value that is not a document id can only be a mistake or an attempt, and
  // carrying it into the form would silently match no talks at all.
  it.each([
    'speaker abc',
    'speaker"] || true',
    '*',
    'a'.repeat(121),
    '',
    '   ',
  ])('drops %j rather than seeding it', (value) => {
    expect(parseInvitationPrefill({ speaker: value }).speakerId).toBeUndefined()
  })

  it('drops a role that is not one of the four', () => {
    expect(parseInvitationPrefill({ role: 'ambassador' }).role).toBeUndefined()
    expect(parseInvitationPrefill({ role: 'SPEAKER' }).role).toBeUndefined()
  })

  it('round-trips a speaker link through the parser', () => {
    const prefill = {
      fullName: 'Chen Wei',
      email: 'chen@example.com',
      speakerId: 'speaker-xyz',
      role: 'speaker' as const,
    }

    const params = Object.fromEntries(
      new URL(invitationLetterHref(prefill), 'https://x.test').searchParams,
    )

    expect(parseInvitationPrefill(params)).toEqual(prefill)
  })
})
