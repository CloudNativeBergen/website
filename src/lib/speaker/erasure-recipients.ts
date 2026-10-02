/**
 * Erasure's sent-communication branch (#1265, spec #1260).
 *
 * `crm.sendCommunication` writes an `email` activity carrying a SNAPSHOT of
 * each recipient — contact key, name, address, role — beside the subject and
 * body exactly as sent. The record is the organization's evidence of what it
 * sent and to whom, and it is kept for the life of the sponsor record (the
 * privacy page says so). When the person asks to be erased, the two values
 * that identify them — `name` and `email` — are replaced by a marker, and
 * everything else stays: the body, the subject, the template, the provider
 * id, the other recipients. The generated timeline line is built from the
 * first recipient's name, so a copy of the name standing there is replaced
 * too.
 *
 * THE EMAIL-KEYED CLASS, array shape. The entry holds no reference to the
 * person, so `*[references($id)]` cannot find it; it is reached by address,
 * like `talk.issuedSpeakerTickets[].email` and `speaker.mergedWith[]
 * .loserEmails`, and matched case-insensitively because the snapshot keeps
 * the address as the contact typed it. `contactKey` is retained: it is the
 * opaque key of the entry on the sponsor's own contact list, not a datum
 * about the person.
 *
 * SCOPE. Found GLOBALLY, like every other read in `./erasure.ts`: the right
 * is the person's, not a tenant's, and the same address may be a contact for
 * sponsors of two organizations.
 *
 * Pure planner plus one read function, split from `./erasure.ts` like
 * `./erasure-assets.ts` and `./erasure-mentions.ts`.
 */
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { normalizeEmail } from './email'
import type { ErasureDocumentPatch } from './erasure'

/** What an erased recipient's name reads as, in the timeline and on expand. */
export const REDACTED_RECIPIENT_NAME = 'Erased contact'
/**
 * RFC 2606 `.invalid`: undeliverable, and a shape no real contact can carry,
 * so a redacted entry is never matched by a later erasure of somebody else.
 */
export const REDACTED_RECIPIENT_EMAIL = 'erased@anonymous.invalid'

/** Sanity `_key`s are safe to interpolate only if they look like this. */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/

/** One recipient snapshot as stored on the activity. */
export interface SponsorActivityRecipientEntry {
  _key?: string
  contactKey?: string
  name?: string
  email?: string
  role?: string
  isDefault?: boolean
}

/** The projection {@link fetchSponsorRecipientDocs} reads. */
export interface SponsorActivityRecipientDoc {
  _id: string
  _rev?: string
  description?: string
  recipients?: SponsorActivityRecipientEntry[]
}

/**
 * The patch that redacts the subject out of one send record, or `null` when
 * nothing is left to change — which is what makes a second run a no-op and
 * an already-redacted record harmless.
 *
 * @param emails The subject's normalised address match-set.
 * @param refusals An entry that names the subject but cannot be addressed by
 *   a safe `_key` is reported here, never silently skipped: data we cannot
 *   clear must not be reported clean.
 */
export function planSponsorRecipientRedaction(
  doc: SponsorActivityRecipientDoc,
  emails: readonly string[],
  refusals: string[],
): ErasureDocumentPatch | null {
  const entries = Array.isArray(doc.recipients) ? doc.recipients : []
  const set: Record<string, unknown> = {}
  const keys: string[] = []
  let description =
    typeof doc.description === 'string' ? doc.description : undefined
  let descriptionChanged = false

  for (const entry of entries) {
    const stored = typeof entry.email === 'string' ? entry.email : ''
    if (!stored || !emails.includes(normalizeEmail(stored))) continue

    const nameDone = entry.name === REDACTED_RECIPIENT_NAME
    const emailDone = normalizeEmail(stored) === REDACTED_RECIPIENT_EMAIL
    if (nameDone && emailDone) continue

    const key = entry._key
    if (typeof key !== 'string' || !SAFE_KEY.test(key)) {
      refusals.push(
        `Sponsor activity ${doc._id} has a recipient entry naming the subject ` +
          `whose _key ${JSON.stringify(key)} cannot be safely selected; redact it by hand`,
      )
      continue
    }
    const path = `recipients[_key=="${key}"]`
    if (!nameDone) set[`${path}.name`] = REDACTED_RECIPIENT_NAME
    if (!emailDone) set[`${path}.email`] = REDACTED_RECIPIENT_EMAIL
    keys.push(key)

    // The timeline line copies the first recipient's name verbatim.
    if (description && entry.name && description.includes(entry.name)) {
      description = description.split(entry.name).join(REDACTED_RECIPIENT_NAME)
      descriptionChanged = true
    }
  }

  if (keys.length === 0) return null
  if (descriptionChanged) set.description = description
  return {
    id: doc._id,
    type: 'sponsorActivity',
    rev: doc._rev,
    set,
    reason: `sent-communication recipient redaction: ${keys.join(', ')}`,
  }
}

/**
 * Every send record carrying one of the subject's addresses, in any tenant.
 * `lower()` because the snapshot keeps the address as typed and the match
 * set is normalised. Pinned by `erasure.emailKeyed.test.ts`.
 */
export async function fetchSponsorRecipientDocs(
  emails: readonly string[],
): Promise<SponsorActivityRecipientDoc[]> {
  if (emails.length === 0) return []
  return (
    (await clientReadUncached.fetch<SponsorActivityRecipientDoc[]>(
      // groq-global: the sent-communication audit (#1261) snapshots a
      // recipient by ADDRESS and holds no reference to them, so the
      // `references()` read in erasure.ts is structurally blind to it. The
      // right belongs to the person, who may be a contact for sponsors of
      // several organizations, so this is not scoped to a tenant.
      groq`*[_type == "sponsorActivity" && count(recipients[lower(email) in $emails]) > 0]{
        _id, _rev, description, recipients
      }`,
      { emails },
      { cache: 'no-store' },
    )) ?? []
  )
}
