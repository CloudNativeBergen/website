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
