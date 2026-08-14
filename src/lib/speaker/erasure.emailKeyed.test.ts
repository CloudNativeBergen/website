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

/**
 * Schema files that declare NO document type, and why. Everything else in
 * `schemaTypes/` MUST yield a document type — see the completeness test below.
 *
 * This allowlist is the point of the whole file. The first version of this
 * scanner extracted the document name with a regex that required `name:` to
 * come BEFORE `type: 'document'`; a perfectly legal `defineType({ type:
 * 'document', name: 'guestPass', ... })` carrying an email field was SILENTLY
 * SKIPPED and the suite stayed green. Every schema in the repo happens to be
 * name-first, so nothing under-erased — but a guard that silently matches
 * nothing is exactly the failure this mechanism exists to prevent, and it has
 * the same shape as the two misses it caught: invisible, green, and wrong only
 * once somebody adds something new.
 *
 * So the extraction is order-agnostic AND every file must account for itself.
 * A file that cannot be parsed fails loudly instead of vanishing from the scan.
 */
const NON_DOCUMENT_SCHEMAS: Record<string, string> = {
  'attachment.ts': 'fileAttachment / urlAttachment — object types',
  'blockContent.ts': 'array type used by rich-text fields',
  'constants.ts': 'plain option constants, no defineType at all',
  'conversationParticipant.ts': 'object type embedded in `conversation`',
  'dataProcessingConsent.ts': 'shared consent object type',
  'richTextContent.ts': 'richTextCode / richTextImage — object and image types',
}

/** Header of every `defineType({...})` in a file, up to its `fields:` key. */
function typeHeaders(source: string): string[] {
  const headers: string[] = []
  const starts: number[] = []
  for (const match of source.matchAll(/defineType\(\{/g)) {
    starts.push(match.index)
  }
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]
    const nextType = starts[i + 1] ?? source.length
    const fields = source.indexOf('\n  fields:', from)
    const to = Math.min(nextType, fields === -1 ? source.length : fields)
    headers.push(source.slice(from, to))
  }
  return headers
}

/**
 * Document type names declared in a file, and whether any declaration could not
 * be read. ORDER-AGNOSTIC: `name` and `type` may appear in either order.
 */
function documentTypesIn(source: string): {
  names: string[]
  unparseable: number
} {
  const names: string[] = []
  let unparseable = 0
  for (const header of typeHeaders(source)) {
    if (!/type:\s*'document'/.test(header)) continue
    const name = header.match(/name:\s*'([A-Za-z]+)'/)?.[1]
    if (name) names.push(name)
    else unparseable += 1
  }
  return { names, unparseable }
}

/** Email-address fields declared in a source file, keyed `<docType>.<field>`. */
function emailFieldsIn(
  docType: string,
  source: string,
): Array<{ key: string; type: string; field: string }> {
  const found: Array<{ key: string; type: string; field: string }> = []
  for (const match of source.matchAll(/name:\s*'([A-Za-z]+)'/g)) {
    const field = match[1]
    if (field === docType) continue
    if (!EMAIL_FIELD.test(field)) continue
    if (NOT_AN_ADDRESS.test(field)) continue
    const key = `${docType}.${field}`
    if (!found.some((f) => f.key === key))
      found.push({ key, type: docType, field })
  }
  return found
}

function schemaFiles(): string[] {
  return readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort()
}

/** `{ documentType, field }` for every email-address field in the schemas. */
function scanSchemas(): Array<{ key: string; type: string; field: string }> {
  const found: Array<{ key: string; type: string; field: string }> = []
  for (const file of schemaFiles()) {
    const source = readFileSync(join(SCHEMA_DIR, file), 'utf8')
    for (const docType of documentTypesIn(source).names) {
      for (const hit of emailFieldsIn(docType, source)) {
        if (!found.some((f) => f.key === hit.key)) found.push(hit)
      }
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key))
}

describe('the scanner cannot silently skip a schema file', () => {
  it('every file either yields a document type or is a declared non-document', () => {
    const unaccounted: string[] = []
    for (const file of schemaFiles()) {
      const source = readFileSync(join(SCHEMA_DIR, file), 'utf8')
      const { names, unparseable } = documentTypesIn(source)
      if (unparseable > 0) {
        unaccounted.push(`${file} (a document declaration could not be read)`)
      } else if (names.length === 0 && !(file in NON_DOCUMENT_SCHEMAS)) {
        unaccounted.push(`${file} (no document type found)`)
      }
    }
    expect(
      unaccounted,
      'A schema file produced no document type and is not on the ' +
        'NON_DOCUMENT_SCHEMAS allowlist. Either it declares a document this ' +
        'scanner cannot read — fix the scanner, do NOT allowlist it — or it is ' +
        'genuinely not a document, in which case add it with a reason. A file ' +
        'that vanishes from the scan takes its email fields with it.',
    ).toEqual([])
  })

  it('no allowlisted file actually declares a document', () => {
    const mislabelled = Object.keys(NON_DOCUMENT_SCHEMAS).filter((file) => {
      const path = join(SCHEMA_DIR, file)
      return (
        readdirSync(SCHEMA_DIR).includes(file) &&
        documentTypesIn(readFileSync(path, 'utf8')).names.length > 0
      )
    })
    expect(
      mislabelled,
      'The allowlist must never hide a real document type.',
    ).toEqual([])
  })

  it('has no stale allowlist entries', () => {
    const files = new Set(schemaFiles())
    expect(
      Object.keys(NON_DOCUMENT_SCHEMAS).filter((f) => !files.has(f)),
    ).toEqual([])
  })

  it('finds a TYPE-FIRST document schema and its email field (permanent regression case)', () => {
    // The exact file the reviewer wrote to break the first scanner. Property
    // order is legal and enforced nowhere, so this must never regress.
    const typeFirst = `
import { defineType, defineField } from 'sanity'

export default defineType({
  type: 'document',
  name: 'guestPass',
  title: 'Guest Pass',
  fields: [
    defineField({ name: 'holderEmail', type: 'string' }),
    defineField({ name: 'issuedAt', type: 'datetime' }),
  ],
})
`
    expect(documentTypesIn(typeFirst).names).toEqual(['guestPass'])
    expect(emailFieldsIn('guestPass', typeFirst).map((f) => f.key)).toEqual([
      'guestPass.holderEmail',
    ])
  })

  it('still reads the NAME-FIRST form every current schema uses', () => {
    const nameFirst = `
export default defineType({
  name: 'guestPass',
  title: 'Guest Pass',
  type: 'document',
  fields: [defineField({ name: 'holderEmail', type: 'string' })],
})
`
    expect(documentTypesIn(nameFirst).names).toEqual(['guestPass'])
  })

  it('reports an unreadable document declaration rather than skipping it', () => {
    const noName = `
export default defineType({
  type: 'document',
  fields: [defineField({ name: 'holderEmail', type: 'string' })],
})
`
    expect(documentTypesIn(noName)).toEqual({ names: [], unparseable: 1 })
  })

  it('does not mistake a nested object type for a document', () => {
    const objectType = `
export default defineType({
  name: 'consentBlob',
  type: 'object',
  fields: [defineField({ name: 'contactEmail', type: 'string' })],
})
`
    expect(documentTypesIn(objectType)).toEqual({ names: [], unparseable: 0 })
  })
})

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
