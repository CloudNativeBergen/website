/**
 * Right to erasure for a SPONSOR CONTACT's send records (#1265).
 *
 * A sponsor contact is a person on a sponsor's contact list, usually with no
 * speaker document at all, so the speaker erasure chain cannot reach them.
 * The privacy page promises every sponsor contact that an erasure request
 * replaces their name and address in the records of emails sent to them;
 * this is the operation that keeps that promise for a person the speaker
 * chain does not know.
 *
 * It does exactly one thing: every `sponsorActivity` send record carrying one
 * of the given addresses is redacted by the same planner the speaker chain
 * uses (`@/lib/speaker/erasure-recipients`), in one revision-guarded
 * transaction, and then re-read to count what is left. The contact's entry on
 * the sponsor's own contact list is the organizer's to remove in the CRM, and
 * the organizer's free text (subject, body) is not erased; the runbook says so.
 *
 * GLOBAL, like the speaker chain: the right is the person's, and the same
 * address can be a contact for sponsors of two organizations.
 */
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  getOrCreateConferenceAudienceByType,
  removeContactFromAudience,
} from '@/lib/email/audience'
import type { Conference } from '@/lib/conference/types'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { canonicalEmail } from '@/lib/speaker/email'
import type { ErasureDocumentPatch } from '@/lib/speaker/erasure'
import {
  fetchSponsorRecipientDocs,
  planSponsorRecipientRedaction,
} from '@/lib/speaker/erasure-recipients'

export interface EraseSponsorContactOptions {
  /** The addresses the request names; matched after normalisation. */
  emails: readonly string[]
  /** Who ran it, for the operator log. */
  actor: string
  /** Compute and return the plan WITHOUT writing anything. */
  dryRun?: boolean
}

export interface EraseSponsorContactResult {
  /** The normalised match set the records were selected by. */
  emails: string[]
  /** Send records found carrying one of the addresses. */
  matched: number
  /** The redactions that would be (or were) staged, one per record. */
  patches: ErasureDocumentPatch[]
  /** Entries that could not be addressed safely; nothing is written if any. */
  refusals: string[]
  committed: boolean
  /**
   * Records still carrying an address after the run — re-read and re-planned
   * with the same match set, so it cannot drift from what the sweep does.
   * `null` on a dry run, or when the verification read itself failed after
   * a successful commit (`err` says so; `committed` stays true).
   */
  residual: number | null
  err: Error | null
  /**
   * Sponsor audiences (Resend) the address could NOT be removed from, as
   * `conferenceId: reason`. Best effort: logged, never fails the erasure.
   */
  audienceFailures: string[]
}

/**
 * The match set: each address trimmed and lowercased, and NOTHING wider.
 * The operator types these, so NFKC folding would conflate two mailboxes
 * that differ by a compatibility character (`ａda@x` and `ada@x`) and redact
 * somebody else — the widening `@/lib/speaker/email` warns every new
 * user-typed path about. The planner is told to fold the stored address the
 * same way, so both sides compare on the plain form, which is also the only
 * form the `lower()`-only GROQ read can select by. An address the person
 * used in two compatibility spellings is given twice.
 */
export function sponsorContactMatchSet(emails: readonly string[]): string[] {
  return [...new Set(emails.map((e) => canonicalEmail(e)))].filter((e) =>
    e.includes('@'),
  )
}

async function planAll(emails: string[]): Promise<{
  matched: number
  patches: ErasureDocumentPatch[]
  refusals: string[]
}> {
  const docs = await fetchSponsorRecipientDocs(emails)
  const refusals: string[] = []
  const patches: ErasureDocumentPatch[] = []
  for (const doc of docs) {
    const patch = planSponsorRecipientRedaction(
      doc,
      emails,
      refusals,
      canonicalEmail,
    )
    if (patch) patches.push(patch)
  }
  patches.push(...(await planSignerRedaction(emails)))
  return { matched: docs.length, patches, refusals }
}

/**
 * The agreement signer stored on a sponsor record (#1282). Left in place, the
 * contract reminder cron would still mail an erased signer, and the composer
 * would still name them as the signer on record. Both fields are cleared when
 * the stored address is one being erased.
 */
async function planSignerRedaction(
  emails: string[],
): Promise<ErasureDocumentPatch[]> {
  const docs =
    (await clientReadUncached
      .withConfig({ apiVersion: COUNT_API_VERSION })
      .fetch<Array<{ _id: string; _rev: string; signerEmail?: string }>>(
        // groq-global: the right is the person's, and the same address can
        // sign for sponsors in several organizations, like the read above.
        `*[_type == "sponsorForConference" && lower(signerEmail) in $emails]{ _id, _rev, signerEmail }`,
        { emails },
        { cache: 'no-store', perspective: 'raw' },
      )) ?? []
  return docs
    .filter((doc) => emails.includes(canonicalEmail(doc.signerEmail ?? '')))
    .map((doc) => ({
      id: doc._id,
      type: 'sponsorForConference',
      rev: doc._rev,
      unset: ['signerEmail', 'signerName'],
      reason: 'erased contact is the stored agreement signer',
    }))
}

/**
 * Redact one person out of every sponsor send record, by address.
 *
 * Idempotent: a second run over the same addresses finds the records (the
 * marker address is not in the match set, so it does not even select them)
 * and stages nothing. A refusal writes nothing at all.
 */
export async function eraseSponsorContactSendRecords(
  options: EraseSponsorContactOptions,
): Promise<EraseSponsorContactResult> {
  const emails = sponsorContactMatchSet(options.emails)
  const base = {
    emails,
    matched: 0,
    patches: [] as ErasureDocumentPatch[],
    refusals: [] as string[],
    committed: false,
    residual: null as number | null,
    err: null as Error | null,
    audienceFailures: [] as string[],
  }
  // An address without "@" is not an address: `--email --actor "x"` on the
  // CLI would otherwise search for the literal "--actor", find nothing and
  // report clean.
  const rejected = options.emails.filter(
    (e) => canonicalEmail(e).length > 0 && !canonicalEmail(e).includes('@'),
  )
  if (rejected.length > 0) {
    return {
      ...base,
      err: new Error(
        `Not an email address: ${rejected.map((e) => JSON.stringify(e)).join(', ')}`,
      ),
    }
  }
  if (emails.length === 0) {
    return { ...base, err: new Error('No email address given') }
  }

  try {
    const plan = await planAll(emails)
    const result = { ...base, ...plan }
    if (plan.refusals.length > 0) {
      return {
        ...result,
        err: new Error(`Refused: ${plan.refusals.join('; ')}`),
      }
    }
    if (options.dryRun) return result

    if (plan.patches.length > 0) {
      // Same API version as the speaker chain's transaction, so a Content
      // Release copy of a record is addressed the same way.
      const tx = clientWrite
        .withConfig({ apiVersion: COUNT_API_VERSION })
        .transaction()
      for (const patch of plan.patches) {
        tx.patch(patch.id, (p) => {
          const applied = patch.unset
            ? p.unset(patch.unset)
            : p.set(patch.set ?? {})
          // Revision-guarded: a concurrent edit makes the whole transaction
          // 409 rather than clobber it; the operator re-runs.
          return patch.rev ? applied.ifRevisionId(patch.rev) : applied
        })
      }
      await tx.commit()
    }

    // The commit is done: a failure from here on must not hide it, or the
    // operator reads "nothing written" over a record that was.
    const audienceFailures = await removeFromSponsorAudiences(emails)
    try {
      const after = await planAll(emails)
      return {
        ...result,
        audienceFailures,
        committed: true,
        residual: after.patches.length + after.refusals.length,
      }
    } catch (error) {
      return {
        ...result,
        audienceFailures,
        committed: true,
        err: new Error(
          `Committed, but the verification read failed: ${
            error instanceof Error ? error.message : String(error)
          }. Re-run to verify.`,
        ),
      }
    }
  } catch (error) {
    return {
      ...base,
      err: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Takes the addresses out of every conference's sponsor audience on Resend.
 * A sponsor sync keeps unsubscribed contacts only while the CRM still holds
 * them, but an erasure must not wait for the next sync. Every conference with
 * sponsors, because the right is the person's, like the records above.
 *
 * ponytail: resolving an audience creates it when a conference has none yet
 * (an empty audience, harmless); add a find-only resolver if that matters.
 */
async function removeFromSponsorAudiences(emails: string[]): Promise<string[]> {
  const failures: string[] = []
  let conferences: Conference[] = []
  try {
    const ids = await clientReadUncached.fetch<string[]>(
      // groq-global: erasure is the person's right across every tenant, like
      // the send-record read in `erasure-recipients.ts`.
      `array::unique(*[_type == "sponsorForConference"].conference._ref)`,
    )
    conferences =
      (await clientReadUncached.fetch<Conference[]>(
        // groq-global: the conferences named by the read above, by id.
        `*[_type == "conference" && _id in $ids]{ _id, title, organization }`,
        { ids: ids ?? [] },
      )) ?? []
  } catch (error) {
    console.warn('[contact-erasure] listing conferences failed:', error)
    return ['*: could not list conferences']
  }
  for (const conference of conferences) {
    try {
      const { audienceId, client, error } =
        await getOrCreateConferenceAudienceByType(conference, 'sponsors')
      if (!audienceId) throw error ?? new Error('no sponsor audience')
      for (const email of emails) {
        const removed = await removeContactFromAudience(
          client,
          audienceId,
          email,
        )
        if (!removed.success) {
          throw removed.error ?? new Error(`could not remove ${email}`)
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('[contact-erasure] sponsor audience removal failed:', {
        conferenceId: conference._id,
        reason,
      })
      failures.push(`${conference._id}: ${reason}`)
    }
  }
  return failures
}
