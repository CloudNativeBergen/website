/**
 * Pure-planner tests for the sent-communication branch of erasure (#1265).
 *
 * The positive tests fail on a VALUE: the name or address still standing, a
 * field that should have survived being touched, the wrong document
 * addressed. The negative ones (somebody else's record, no recipients, an
 * already-redacted entry) assert `null`, and each is paired with a positive
 * test on the same fixture so the path cannot pass vacuously.
 *
 * Two of the tests go through the real thing rather than this module's view
 * of it: the planned `set` is applied by `@sanity/mutator`, Sanity's own
 * patch engine, and the GROQ read is run by `groq-js` over a tiny dataset.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { parse, evaluate } from 'groq-js'
import {
  planSponsorRecipientRedaction,
  REDACTED_RECIPIENT_EMAIL,
  REDACTED_RECIPIENT_NAME,
  type SponsorActivityRecipientDoc,
} from './erasure-recipients'

const EMAILS = ['ada@example.com', 'ada.l@work.io']

// `@sanity/mutator` is a dependency of `sanity`, not of this repo, so it is
// resolved from there — the same way `speaker.socialTagOptOut.test.ts` does.
const { Mutation } = createRequire(
  createRequire(import.meta.url).resolve('sanity/package.json'),
)('@sanity/mutator') as {
  Mutation: new (o: { mutations: unknown[] }) => {
    apply: (d: unknown) => Record<string, unknown> | null
  }
}

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

  it('matches a single recipient whose own name ends in a count-looking tail', () => {
    const patch = planSponsorRecipientRedaction(
      activity({
        description: 'Information sent to Ada (+1)',
        recipients: [
          {
            _key: 'k1',
            contactKey: 'k1',
            name: 'Ada (+1)',
            email: 'ada@example.com',
            isDefault: true,
          },
        ],
      }),
      EMAILS,
      [],
    )!
    expect(patch.set!.description).toBe(
      `Information sent to ${REDACTED_RECIPIENT_NAME}`,
    )
  })

  it('leaves the description alone when the subject is not its first recipient', () => {
    // "Al" is inside "Alan": a substring replace would turn the line into
    // "Erased contactan (+1)". Only the first recipient is ever in the line.
    const patch = planSponsorRecipientRedaction(
      activity({
        description: 'Information sent to Alan Turing (+1)',
        recipients: [
          {
            _key: 'k-alan',
            contactKey: 'k-alan',
            name: 'Alan Turing',
            email: 'alan@example.com',
            isDefault: true,
          },
          {
            _key: 'k-al',
            contactKey: 'k-al',
            name: 'Al',
            email: 'ada@example.com',
            isDefault: false,
          },
        ],
      }),
      EMAILS,
      [],
    )!
    expect(patch.set).toEqual({
      'recipients[_key=="k-al"].name': REDACTED_RECIPIENT_NAME,
      'recipients[_key=="k-al"].email': REDACTED_RECIPIENT_EMAIL,
    })
  })

  it('redacts an address that ends a sentence, and not one that continues into a longer domain', () => {
    // `ada@example.com.` ends a sentence; `ada@example.com.au` and
    // `ada@example.com-two` are longer domains (a hyphen can continue a
    // label), so they are somebody else's and stay.
    const patch = planSponsorRecipientRedaction(
      activity({
        error:
          'Mailbox ada@example.com. Not ada@example.com.au, not ada@example.com-two.',
      }),
      EMAILS,
      [],
    )!
    expect(patch.set!.error).toBe(
      `Mailbox ${REDACTED_RECIPIENT_EMAIL}. Not ada@example.com.au, not ada@example.com-two.`,
    )
  })

  it('does not touch somebody else’s address that merely ends with the subject’s', () => {
    const patch = planSponsorRecipientRedaction(
      activity({
        error: 'nada@example.com bounced; ada@example.com bounced',
      }),
      EMAILS,
      [],
    )!
    expect(patch.set!.error).toBe(
      `nada@example.com bounced; ${REDACTED_RECIPIENT_EMAIL} bounced`,
    )
  })

  it('redacts the error by the match set even when the entry already carries the markers', () => {
    // A hand-redacted entry no longer says which address the error quotes.
    const patch = planSponsorRecipientRedaction(
      activity({
        error: 'ada@example.com rejected',
        recipients: [
          {
            _key: 'contact-ada',
            contactKey: 'contact-ada',
            name: REDACTED_RECIPIENT_NAME,
            email: REDACTED_RECIPIENT_EMAIL,
            isDefault: true,
          },
        ],
      }),
      EMAILS,
      [],
    )!
    expect(patch.set).toEqual({
      error: `${REDACTED_RECIPIENT_EMAIL} rejected`,
    })
  })

  it('redacts the address out of a failed send’s provider error, whatever its casing', () => {
    const patch = planSponsorRecipientRedaction(
      activity({
        error:
          'Mailbox for ADA@example.com does not exist (ada@example.com rejected)',
      }),
      EMAILS,
      [],
    )!
    expect(patch.set!.error).toBe(
      `Mailbox for ${REDACTED_RECIPIENT_EMAIL} does not exist (${REDACTED_RECIPIENT_EMAIL} rejected)`,
    )
  })

  it('leaves an error that does not quote the address alone', () => {
    const patch = planSponsorRecipientRedaction(
      activity({ error: 'Rate limited (429)' }),
      EMAILS,
      [],
    )!
    expect(patch.set).toEqual({
      'recipients[_key=="contact-ada"].name': REDACTED_RECIPIENT_NAME,
      'recipients[_key=="contact-ada"].email': REDACTED_RECIPIENT_EMAIL,
      description: `Information sent to ${REDACTED_RECIPIENT_NAME} (+1)`,
    })
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

describe('the patch and the read work against the real engines, not this module’s mock of them', () => {
  const RECIPIENTS = activity().recipients!
  const FULL_RECORD = {
    ...activity(),
    recipients: RECIPIENTS,
    _type: 'sponsorActivity',
    activityType: 'email',
    communicationKind: 'information',
    subject: 'Welcome, Ada',
    body: '<p>Hi Ada, here is the information.</p>',
    providerMessageId: 'msg-1',
    deliveryStatus: 'sent',
    createdAt: '2026-10-01T10:00:00.000Z',
  }

  it('applied by @sanity/mutator, the set reaches the keyed entry and nothing else moves', () => {
    const patch = planSponsorRecipientRedaction(FULL_RECORD, EMAILS, [])!
    const after = new Mutation({
      mutations: [{ patch: { id: FULL_RECORD._id, set: patch.set } }],
    }).apply(FULL_RECORD)!

    const recipients = after.recipients as Array<Record<string, unknown>>
    expect(recipients[0]).toEqual({
      _key: 'contact-ada',
      contactKey: 'contact-ada',
      name: REDACTED_RECIPIENT_NAME,
      email: REDACTED_RECIPIENT_EMAIL,
      role: 'Signer',
      isDefault: true,
    })
    expect(recipients[1]).toEqual(RECIPIENTS[1])
    expect(after.description).toBe(
      `Information sent to ${REDACTED_RECIPIENT_NAME} (+1)`,
    )
    // The business record, byte for byte.
    expect(after.subject).toBe('Welcome, Ada')
    expect(after.body).toBe('<p>Hi Ada, here is the information.</p>')
    expect(after.providerMessageId).toBe('msg-1')
    expect(after.deliveryStatus).toBe('sent')
    expect(after.communicationKind).toBe('information')
  })

  it('the GROQ read selects by any recipient address, case-insensitively, and nothing else', async () => {
    const query =
      '*[_type == "sponsorActivity" && count(recipients[lower(email) in $emails]) > 0]{ _id }'
    const dataset = [
      FULL_RECORD,
      {
        ...FULL_RECORD,
        _id: 'activity-other',
        recipients: [RECIPIENTS[1]],
      },
      { _id: 'not-an-activity', _type: 'speaker', email: 'ada@example.com' },
    ]
    const ids = await (
      await evaluate(parse(query), { dataset, params: { emails: EMAILS } })
    ).get()
    expect(ids).toEqual([{ _id: 'activity-1' }])
  })

  it('the read finds the canonical form the sender writes, and NOT a raw whitespace form — the stated residual', async () => {
    // GROQ cannot trim. The contract that closes the gap is at the write
    // seam (`resolveRecipients` stores `canonicalEmail`), pinned in
    // `communication.test.ts`; this pins the read's side of it, including
    // the shape it cannot see, so the residual stays honest.
    const query =
      '*[_type == "sponsorActivity" && count(recipients[lower(email) in $emails]) > 0]._id'
    const stored = (email: string, id: string) => ({
      _id: id,
      _type: 'sponsorActivity',
      recipients: [{ _key: 'k', email }],
    })
    const dataset = [
      stored('ada.l@work.io', 'canonical'),
      stored('ADA.L@work.io', 'upper'),
      stored('  ada.l@work.io ', 'raw-whitespace'),
    ]
    const ids = await (
      await evaluate(parse(query), { dataset, params: { emails: EMAILS } })
    ).get()
    expect(ids).toEqual(['canonical', 'upper'])
  })
})
