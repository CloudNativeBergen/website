/**
 * @vitest-environment node
 *
 * THE EMAIL-KEYED CLASS IS PINNED HERE.
 *
 * `eraseSpeakerInPlace` finds dependent data two ways: `*[references($id)]`,
 * which follows references, and a targeted read for documents that record a
 * person by their PLAINTEXT EMAIL ADDRESS instead. The second kind is invisible
 * to the first — there is no reference to follow — and it is the normal shape
 * for an invitation, which exists precisely because the person may have no
 * account yet.
 *
 * Missing one is the operation's worst failure mode: the sweep completes,
 * `verifySpeakerErasure` reports CLEAN, and a document carrying the person's
 * address (and, for an invitation, a LIVE BEARER TOKEN to their mailbox)
 * survives. We would have told them it was gone.
 *
 * It has happened twice. `coSpeakerInvitation` was caught while implementing.
 * `organizerInvitation` shipped in #880 three days earlier and was missed — and
 * NO test or production query could have found it, because its production count
 * was ZERO. A count of zero is the DANGEROUS case: an invite-gated launch means
 * the first real use creates the hole.
 *
 * So this file does not test behaviour. It scans every schema for an
 * email-shaped field and fails until each one is recorded with a disposition,
 * which moves the next occurrence from "found by an erasure that silently
 * under-delivered" to "found at review".
 *
 * WHEN THIS FAILS: a schema gained an email field. Decide which case you are in.
 *   - It can hold a SPEAKER's address → add it to EMAIL_KEYED_ERASURE_SITES in
 *     `erasure.ts` AND to the query in `fetchErasureInputs`, then record it
 *     below as 'swept'.
 *   - It cannot → record it below with the reason. Do not delete the row.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMAIL_KEYED_ERASURE_SITES } from './erasure'

const SCHEMA_DIR = join(__dirname, '..', '..', '..', 'sanity', 'schemaTypes')
const ERASURE_SOURCE = readFileSync(join(__dirname, 'erasure.ts'), 'utf8')

/** A field name that plausibly stores an email ADDRESS (not a flag or a date). */
const EMAIL_FIELD = /^(.*[Ee]mail.*|identifier)$/
/** …minus the ones whose name contains "email" but hold a boolean/date/id. */
const NOT_AN_ADDRESS =
  /^(emailedAt|emailSent|emailSentAt|emailId|emailError|messagingEmailDefault|emailOverride|confirmationEmailSent|emailIdentity)$/

type Disposition =
  | { verdict: 'swept'; why: string }
  | { verdict: 'not-the-speaker-rail'; why: string }
  | { verdict: 'retained'; why: string }
  | { verdict: 'no-pii'; why: string }

/**
 * Every email-address field in the dataset, and what erasure does about it.
 * Keyed `<documentType>.<field>`. Reviewed 2026-08-14.
 */
const DISPOSITIONS: Record<string, Disposition> = {
  // --- swept by the email-keyed read ---------------------------------------
  'coSpeakerInvitation.invitedEmail': {
    verdict: 'swept',
    why: 'an unaccepted invite names a person who may have no account at all',
  },
  'organizerInvitation.invitedEmail': {
    verdict: 'swept',
    why: 'same shape, plus a live bearer token gating a magic link to the mailbox',
  },
  'emailSignInToken.identifier': {
    verdict: 'swept',
    why: 'a live sign-in credential for the subject’s address',
  },

  // --- the subject document itself ------------------------------------------
  'speaker.email': {
    verdict: 'swept',
    why: 'REPLACED with the RFC 2606 .invalid address by the field patch',
  },
  'speaker.knownEmails': {
    verdict: 'swept',
    why: 'unset by the field patch — it is a login match key',
  },
  'talk.email': {
    verdict: 'swept',
    why: 'issuedSpeakerTickets[].email — a plaintext snapshot, unset by _key',
  },

  // --- retained by decision, and named in the runbook ------------------------
  'invitationLetter.recipientEmail': {
    verdict: 'retained',
    why: 'audit trail of an immigration letter actually issued (PRD §3)',
  },
  'invitationLetter.emailedTo': {
    verdict: 'retained',
    why: 'same record; delivery evidence for the letter',
  },

  // --- a different identity rail; a speaker erasure does not reach these -----
  'workshopSignup.userEmail': {
    verdict: 'not-the-speaker-rail',
    why: 'attendee rail — a separate DSR, explicitly out of Phase 1',
  },
  'volunteer.email': {
    verdict: 'not-the-speaker-rail',
    why: 'volunteer rail — a separate DSR, explicitly out of Phase 1',
  },
  'staff.email': {
    verdict: 'not-the-speaker-rail',
    why: 'staff directory, not the speaker person document',
  },
  'sponsorForConference.signerEmail': {
    verdict: 'not-the-speaker-rail',
    why: 'sponsor contract signer — sponsor-contact rail',
  },
  'sponsorForConference.email': {
    verdict: 'not-the-speaker-rail',
    why: 'sponsor contact — sponsor-contact rail',
  },
  // --- organization / conference configuration, not a person ----------------
  'organization.contactEmail': {
    verdict: 'no-pii',
    why: 'tenant configuration address, not a speaker',
  },
  'organization.billingEmail': {
    verdict: 'no-pii',
    why: 'tenant billing address, not a speaker',
  },
  'organization.email': {
    verdict: 'no-pii',
    why: 'the supervisory authority’s public contact address',
  },
  'conference.contactEmail': {
    verdict: 'no-pii',
    why: 'conference configuration address, not a speaker',
  },
  'conference.cfpEmail': {
    verdict: 'no-pii',
    why: 'conference configuration address, not a speaker',
  },
  'conference.sponsorEmail': {
    verdict: 'no-pii',
    why: 'conference configuration address, not a speaker',
  },
}

/** `{ documentType, field }` for every email-address field in the schemas. */
function scanSchemas(): Array<{ key: string; type: string; field: string }> {
  const found: Array<{ key: string; type: string; field: string }> = []
  for (const file of readdirSync(SCHEMA_DIR)) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(SCHEMA_DIR, file), 'utf8')
    // The DOCUMENT type's own name — tolerant of a `title` (and anything else
    // short) sitting between `name` and `type: 'document'`, and deliberately
    // NOT falling back to the file's first `name:`, which in several schemas
    // belongs to a nested object type.
    const docType = source.match(
      /name:\s*'([A-Za-z]+)',[\s\S]{0,160}?type:\s*'document'/,
    )?.[1]
    if (!docType) continue
    for (const match of source.matchAll(/name:\s*'([A-Za-z]+)'/g)) {
      const field = match[1]
      if (field === docType) continue
      if (!EMAIL_FIELD.test(field)) continue
      if (NOT_AN_ADDRESS.test(field)) continue
      const key = `${docType}.${field}`
      if (!found.some((f) => f.key === key)) {
        found.push({ key, type: docType, field })
      }
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key))
}

describe('every email-address field in the dataset has an erasure disposition', () => {
  const fields = scanSchemas()

  it('the scan finds the known fields (it cannot pass vacuously)', () => {
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('coSpeakerInvitation.invitedEmail')
    expect(keys).toContain('organizerInvitation.invitedEmail')
    expect(keys).toContain('speaker.email')
    expect(keys.length).toBeGreaterThanOrEqual(12)
  })

  it('contains no field that has not been reviewed for erasure', () => {
    const unreviewed = fields
      .map((f) => f.key)
      .filter((key) => !(key in DISPOSITIONS))
    expect(
      unreviewed,
      'A schema gained an email-address field. If it can hold a SPEAKER’s ' +
        'address it must be added to EMAIL_KEYED_ERASURE_SITES and to the ' +
        'query in fetchErasureInputs; either way record it in DISPOSITIONS. ' +
        'See the header — this exact gap shipped twice.',
    ).toEqual([])
  })

  it('has no stale rows', () => {
    const keys = new Set(fields.map((f) => f.key))
    const stale = Object.keys(DISPOSITIONS).filter((key) => !keys.has(key))
    expect(
      stale,
      'These fields no longer exist — drop the row rather than leaving a pin ' +
        'that defends nothing.',
    ).toEqual([])
  })
})

describe('the swept set and the query that implements it cannot drift', () => {
  it('every EMAIL_KEYED_ERASURE_SITES entry appears in the fetch query', () => {
    for (const site of EMAIL_KEYED_ERASURE_SITES) {
      expect(
        ERASURE_SOURCE,
        `${site.type} is declared swept but is not in the GROQ read`,
      ).toContain(`_type == "${site.type}" && lower(${site.field}) in $emails`)
    }
  })

  it('every site is matched case-insensitively', () => {
    // A normalised match-set compared against an as-typed stored address is a
    // near-miss waiting to happen; `lower()` is not optional here.
    for (const site of EMAIL_KEYED_ERASURE_SITES) {
      expect(ERASURE_SOURCE).toContain(`lower(${site.field}) in $emails`)
    }
  })

  it('the ticket-email match is case-insensitive too', () => {
    expect(ERASURE_SOURCE).toContain(
      'issuedSpeakerTickets[lower(email) in $emails]',
    )
  })

  it('every DISPOSITIONS row marked `swept` outside the speaker document is a declared site', () => {
    const declared = new Set(
      EMAIL_KEYED_ERASURE_SITES.map((s) => `${s.type}.${s.field}`),
    )
    const sweptElsewhere = Object.entries(DISPOSITIONS)
      .filter(
        ([key, d]) => d.verdict === 'swept' && !key.startsWith('speaker.'),
      )
      .map(([key]) => key)
      // `talk.email` is swept by the ticket read, not the email-keyed read.
      .filter((key) => key !== 'talk.email')
    expect(sweptElsewhere.filter((key) => !declared.has(key))).toEqual([])
  })
})
