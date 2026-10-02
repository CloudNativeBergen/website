/**
 * Pure-planner tests for the sent-communication branch of erasure (#1265).
 *
 * Every test fails on a VALUE — the name or address still standing, a field
 * that should have survived being touched, a patch addressing the wrong
 * document — never on an absence.
 */

import { describe, it, expect } from 'vitest'
import {
  planSponsorRecipientRedaction,
  REDACTED_RECIPIENT_EMAIL,
  REDACTED_RECIPIENT_NAME,
  type SponsorActivityRecipientDoc,
} from './erasure-recipients'

const EMAILS = ['ada@example.com', 'ada.l@work.io']

function activity(
  overrides: Partial<SponsorActivityRecipientDoc> = {},
): SponsorActivityRecipientDoc {
  return {
    _id: 'activity-1',
    _rev: 'rev-activity-1',
    description: 'Information sent to Ada Lovelace (+1)',
    recipients: [
      {
        _key: 'contact-ada',
        contactKey: 'contact-ada',
        name: 'Ada Lovelace',
        email: 'Ada@Example.com',
        role: 'Signer',
        isDefault: true,
      },
      {
        _key: 'contact-bob',
        contactKey: 'contact-bob',
        name: 'Bob Builder',
        email: 'bob@example.com',
        role: 'Marketing',
        isDefault: false,
      },
    ],
    ...overrides,
  }
}

describe('a sent-communication record loses the subject’s name and address', () => {
  it('replaces name and email on the matching entry only, addressed by _key', () => {
    const refusals: string[] = []
    const patch = planSponsorRecipientRedaction(activity(), EMAILS, refusals)!

    expect(refusals).toEqual([])
    expect(patch.id).toBe('activity-1')
    expect(patch.type).toBe('sponsorActivity')
    expect(patch.rev).toBe('rev-activity-1')
    expect(patch.set).toMatchObject({
      'recipients[_key=="contact-ada"].name': REDACTED_RECIPIENT_NAME,
      'recipients[_key=="contact-ada"].email': REDACTED_RECIPIENT_EMAIL,
    })
    // Nothing on the other recipient, and no field is unset: the record is a
    // business record and the body, subject and metadata stay as sent.
    const paths = Object.keys(patch.set!)
    expect(paths.some((p) => p.includes('contact-bob'))).toBe(false)
    expect(
      paths.some((p) => /subject|body|template|attachments|provider/.test(p)),
    ).toBe(false)
    expect(patch.unset).toBeUndefined()
  })

  it('also replaces the name inside the generated description', () => {
    const patch = planSponsorRecipientRedaction(activity(), EMAILS, [])!
    expect(patch.set!.description).toBe(
      `Information sent to ${REDACTED_RECIPIENT_NAME} (+1)`,
    )
  })

  it('leaves the description alone when it does not carry the name', () => {
    const patch = planSponsorRecipientRedaction(
      activity({ description: 'Information sent to Bob Builder (+1)' }),
      EMAILS,
      [],
    )!
    expect(patch.set!.description).toBeUndefined()
  })

  it('matches case-insensitively against the whole match set', () => {
    const patch = planSponsorRecipientRedaction(
      activity({
        recipients: [
          {
            _key: 'k1',
            contactKey: 'k1',
            name: 'Ada L',
            email: '  ADA.L@Work.IO ',
            isDefault: false,
          },
        ],
      }),
      EMAILS,
      [],
    )
    expect(patch?.set).toMatchObject({
      'recipients[_key=="k1"].name': REDACTED_RECIPIENT_NAME,
      'recipients[_key=="k1"].email': REDACTED_RECIPIENT_EMAIL,
    })
  })

  it('is a fixed point: an already-redacted entry stages nothing', () => {
    const redacted = activity({
      description: `Information sent to ${REDACTED_RECIPIENT_NAME} (+1)`,
      recipients: [
        {
          _key: 'contact-ada',
          contactKey: 'contact-ada',
          name: REDACTED_RECIPIENT_NAME,
          email: REDACTED_RECIPIENT_EMAIL,
          isDefault: true,
        },
      ],
    })
    expect(
      planSponsorRecipientRedaction(
        redacted,
        [...EMAILS, REDACTED_RECIPIENT_EMAIL],
        [],
      ),
    ).toBeNull()
  })

  it('stages nothing for a record naming somebody else', () => {
    expect(
      planSponsorRecipientRedaction(
        activity(),
        ['someone.else@example.com'],
        [],
      ),
    ).toBeNull()
  })

  it('stages nothing for a record with no recipients', () => {
    expect(
      planSponsorRecipientRedaction(
        activity({ recipients: undefined }),
        EMAILS,
        [],
      ),
    ).toBeNull()
  })

  it('refuses loudly an entry whose _key cannot be selected', () => {
    const refusals: string[] = []
    const patch = planSponsorRecipientRedaction(
      activity({
        recipients: [
          {
            _key: 'bad"key',
            contactKey: 'bad"key',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            isDefault: true,
          },
        ],
      }),
      EMAILS,
      refusals,
    )
    expect(patch).toBeNull()
    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toContain('activity-1')
  })
})
