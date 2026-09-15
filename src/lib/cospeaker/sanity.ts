import { groq } from 'next-sanity'
import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { CoSpeakerInvitationFull, InvitationStatus } from './types'
import { effectiveInvitationStatus } from './constants'

/**
 * Fetches the plain-text abstract for a proposal by id. The Portable Text
 * `description` field is flattened server-side via `pt::text()`.
 *
 * TENANT-SCOPED (S1, #616): the invitation email flow resolves the current
 * conference before building the email, and the invitation's proposal belongs
 * to it, so the read carries `conference._ref == $conferenceId` — a foreign or
 * unresolvable conference reads as a missing abstract (fail closed to the
 * placeholder).
 *
 * Returns null if the proposal is missing, the abstract is empty, or the
 * fetch fails — callers are expected to fall back to a placeholder.
 */
export async function getProposalAbstract(
  proposalId: string,
  conferenceId: string,
): Promise<string | null> {
  if (!conferenceId) return null

  const query = groq`*[
    _type == "talk" &&
    _id == $proposalId &&
    conference._ref == $conferenceId
  ][0] {
    "abstract": pt::text(description)
  }`

  try {
    const result = await clientRead.fetch<{ abstract?: string | null } | null>(
      query,
      { proposalId, conferenceId },
      { cache: 'no-store' },
    )
    const abstract = result?.abstract?.trim()
    return abstract || null
  } catch (error) {
    console.error('Error fetching proposal abstract:', error)
    return null
  }
}

const INVITATION_PROJECTION = `{
    _id,
    _rev,
    invitedEmail,
    invitedName,
    status,
    token,
    expiresAt,
    createdAt,
    respondedAt,
    declineReason,
    lastRemindedAt,
    _createdAt,
    _updatedAt,
    proposal-> { _id, title, format, status },
    invitedBy-> { _id, name, email },
    conference-> { _id }
  }`

/**
 * Point read of ONE invitation by its own document id, with the proposal and
 * inviter dereferenced (everything a reminder/renewal email needs, plus the
 * bearer token).
 *
 * NOT an authorization boundary. Callers must prove the id first —
 * `requireDocumentInCurrentOrg(id, 'coSpeakerInvitation')` — and then prove the
 * caller's access to the dereferenced proposal. See `invitation.remind` /
 * `invitation.resend`.
 */
export async function getInvitationById(
  id: string,
): Promise<CoSpeakerInvitationFull | null> {
  // groq-global-scoped: by-id point read of a document whose tenancy the CALLER
  // has already proven with `requireDocumentInCurrentOrg(id,
  // 'coSpeakerInvitation')` — that guard resolves `conference->organization._ref`
  // for this exact id and refuses before this read runs, so the id reaching here
  // is already bound to the request's org. Adding a `$orgIds` conjunct here
  // would re-derive the same fact, not a stronger one.
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    _id == $invitationId
  ][0] ${INVITATION_PROJECTION}`

  try {
    const invitation = await clientRead.fetch(
      query,
      { invitationId: id },
      { cache: 'no-store' },
    )
    return invitation || null
  } catch (error) {
    console.error('Error fetching invitation by id:', error)
    return null
  }
}

export async function getInvitationByToken(
  token: string,
): Promise<CoSpeakerInvitationFull | null> {
  // groq-global: capability-addressed point read — the unguessable single-use
  // invitation token IS the credential and resolves to exactly ONE document;
  // the public respond flow must find the invitation before any session or
  // tenant context exists to scope by.
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    token == $invitationToken
  ][0] ${INVITATION_PROJECTION}`

  try {
    const invitation = await clientRead.fetch(
      query,
      { invitationToken: token },
      { cache: 'no-store' },
    )
    return invitation || null
  } catch (error) {
    console.error('Error fetching invitation by token:', error)
    return null
  }
}

/**
 * Days a RESOLVED co-speaker invitation is kept before the record — including
 * the invited email, the invited name and any free-text decline reason — is
 * hard-deleted.
 *
 * WHY 90. It is the retention the notification hub already runs and `/privacy`
 * already states, so a reader meets one number rather than two, and it
 * comfortably spans a CFP-to-programme cycle: an organizer building a schedule
 * can still see who declined and why, and act on it, for a full quarter after
 * the answer came in. Shorter would take the decline reason away while it is
 * still operationally useful; longer would keep an address belonging to someone
 * who never used this site for no purpose we could name.
 */
export const COSPEAKER_INVITATION_RETENTION_DAYS = 90

/** A hard ceiling on deletions per run, so a data problem cannot empty the type. */
const MAX_DELETES_PER_RUN = 200

/**
 * Effective statuses whose documents are purgeable. `accepted` is deliberately
 * ABSENT — see {@link deleteResolvedCoSpeakerInvitations}.
 */
const PURGEABLE_STATUSES = new Set<InvitationStatus>([
  'declined',
  'expired',
  'canceled',
])

interface PurgeCandidate {
  _id: string
  status: string
  expiresAt: string
  respondedAt?: string
}

/**
 * The purge predicate, written ONCE and used twice: to list candidates, and —
 * re-evaluated server-side at mutation time — to delete each one. Sharing the
 * literal is what makes the second evaluation a genuine re-check rather than a
 * second, drifting opinion.
 *
 * `status != "accepted" && !defined(acceptedSpeaker)` is two tests for one
 * thing, deliberately. `status` alone is not enough: when an organizer removes
 * an accepted co-speaker from a proposal, `reconcileRemovedCoSpeakers` flips
 * that row from `accepted` to `canceled` and leaves `acceptedSpeaker` and
 * `respondedAt` in place. On `status` alone this sweep would delete the record
 * of an acceptance that really happened — exactly the provenance the
 * accepted-invitations-are-kept rule exists to protect, and most needed after a
 * removal. `acceptedSpeaker` is the durable fact that someone accepted.
 *
 * RESOLUTION TIME is the moment the invitation stopped being live: for a row
 * still reading `pending` that is its `expiresAt`, and otherwise the recorded
 * answer, falling back to `expiresAt` — the same "once its original expiry date
 * passes" rule the organizer-invitation purge uses for a withdrawal.
 *
 * The `pending` case is NOT redundant with the coalesce. `invitation.resend`
 * renews an invitation in place — including a DECLINED one — setting `status`
 * back to `pending` with a fresh `expiresAt`, and it does not clear
 * `respondedAt`. A plain `coalesce(respondedAt, expiresAt)` would read that
 * stale decline timestamp as the renewed invitation's resolution time and purge
 * the row the day after its new window lapsed, instead of ninety days later.
 * Whichever timestamp is authoritative, it is the one that matches the row's
 * current state.
 *
 * `drafts.**` AND `versions.**` are both excluded because `clientWrite` reads
 * the RAW perspective: it sees Studio drafts and Content Release copies as well
 * as live documents. This job DELETES, so a stray match is not a wasted row —
 * it destroys an editor's draft or a scheduled release copy, and spends the
 * per-run cap doing it. Same pair of exclusions `src/lib/social/sanity.ts` uses
 * throughout.
 *
 * It is a SUPERSET of what gets deleted, never the decision: `status` is a
 * lagging field (a lapsed invitation reads `pending` forever — see
 * {@link isInvitationExpired}), so the decision is made in TypeScript below by
 * `effectiveInvitationStatus`.
 */
const RESOLVED_AT = `select(status == "pending" => expiresAt, coalesce(respondedAt, expiresAt))`

const PURGE_PREDICATE = `_type == "coSpeakerInvitation" &&
  !(_id in path("drafts.**")) &&
  !(_id in path("versions.**")) &&
  status != "accepted" &&
  !defined(acceptedSpeaker) &&
  ${RESOLVED_AT} < $cutoff`

/**
 * groq-global: a platform RETENTION sweep across every tenant, by design — the
 * obligation is to the invitee, who has no tenant, and scoping this to one
 * conference would leave every other tenant's declined invitations behind
 * forever. Tenant isolation is not weakened by the absence of a tenant
 * predicate here, because nothing in this path is selected BY tenant: each row
 * is judged on its own status and timestamps and deleted by its own `_id`. No
 * tenant context reaches this query, so no tenant's context can reach another
 * tenant's rows. The interpolations are module constants — a shared predicate
 * literal and an integer cap — with no request-derived text anywhere in them.
 */
const RESOLVED_INVITATION_PURGE_QUERY = groq`*[${PURGE_PREDICATE}]
  | order(${RESOLVED_AT} asc) [0...${MAX_DELETES_PER_RUN}] {
  _id,
  status,
  expiresAt,
  respondedAt
}`

/**
 * DELETE ONE CANDIDATE, ATOMICALLY. A delete-by-query rather than a delete-by-
 * id, because Sanity evaluates the query at MUTATION time: the predicate is
 * re-checked against the document as it is now, not as the sweep read it.
 *
 * That closes a real race. `invitation.resend` renews a lapsed invitation IN
 * PLACE — same document, new `token` and `expiresAt`, `status` back to
 * `pending` — and `invitation.respond` can accept one. Either can land between
 * the fetch above and the delete below, and a delete-by-id would then destroy a
 * live invitation or a fresh acceptance. A renewed row no longer satisfies
 * `coalesce(respondedAt, expiresAt) < $cutoff`, and an accepted one fails both
 * accepted tests, so the mutation matches nothing and deletes nothing. A lost
 * race is reported as a skip, not a deletion.
 *
 * groq-global: same retention sweep, same reasoning as the query above, and
 * additionally pinned to ONE document id that this run already selected.
 */
const PURGE_ONE_QUERY = groq`*[_id == $id && (${PURGE_PREDICATE})]`

/**
 * Delete co-speaker invitations that have been resolved for longer than
 * {@link COSPEAKER_INVITATION_RETENTION_DAYS} days.
 *
 * WHY THIS EXISTS. A `coSpeakerInvitation` holds an email address, a name and
 * sometimes a free-text decline reason belonging to a person who may never have
 * visited this site — someone typed their address into a form. Until this job
 * existed nothing ever removed that, because cancelling and superseding only
 * set a status. This is issue #1045 item 2.
 *
 * WHAT IT REMOVES: everything whose EFFECTIVE status is `declined`, `canceled`
 * or `expired` and whose resolution is older than the retention window.
 *
 * WHAT IT KEEPS: any invitation that was ever ACCEPTED — whether it still reads
 * `accepted` or was later flipped to `canceled` by removing that co-speaker from
 * the proposal — exactly as the organizer-invitation purge keeps its own. The
 * speaker being on the talk records THAT they are a speaker, not who asked them
 * or when; and the person named is by then a speaker with a profile and an
 * account here, whose address we hold anyway, so deleting it discards the
 * provenance of a grant without reducing what we hold about anybody.
 *
 * UNATTENDED-SAFETY RULES, all enforced below:
 *  - BOUNDED. At most MAX_DELETES_PER_RUN documents per run, capped in the
 *    query itself. On reaching the cap the run reports `capped: true` and the
 *    remainder is left for tomorrow.
 *  - COMPUTED STATUS. `effectiveInvitationStatus` decides, never the stored
 *    string. A `pending` invitation that is still OPEN is never deleted, even
 *    if the query hands one over.
 *  - RACE-SAFE. Each delete re-evaluates the predicate server-side against the
 *    document as it is at mutation time, so a renewal or an acceptance landing
 *    mid-run is counted as a skip rather than destroyed. See
 *    {@link PURGE_ONE_QUERY}.
 *  - FAIL-SOFT PER DOCUMENT. One failed delete is counted and the loop
 *    continues. A failed candidate READ is NOT swallowed: it throws, so the
 *    route answers 500 and a broken sweep cannot masquerade as an empty one
 *    while personal data accumulates.
 *  - AUDITABLE, WITHOUT RE-LEAKING. Document ids are logged, never the email,
 *    name or decline reason being purged.
 *  - DRY-RUN. `dryRun: true` reports exactly what a real run would delete and
 *    writes nothing.
 */
export async function deleteResolvedCoSpeakerInvitations(options?: {
  /** Governs the retention cutoff. Injected by tests for a deterministic window. */
  now?: Date
  dryRun?: boolean
}): Promise<{
  scanned: number
  deleted: number
  skipped: number
  failed: number
  capped: boolean
  dryRun: boolean
  ids: string[]
}> {
  const now = options?.now ?? new Date()
  const dryRun = options?.dryRun ?? false
  const cutoff = new Date(
    now.getTime() - COSPEAKER_INVITATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Deliberately NOT caught. A sweep that cannot read is broken, not empty, and
  // the two must not report the same thing to whatever watches the cron.
  const rows = await clientWrite.fetch<PurgeCandidate[]>(
    RESOLVED_INVITATION_PURGE_QUERY,
    { cutoff },
    { cache: 'no-store' },
  )

  const ids: string[] = []
  let deleted = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    // THE GUARD. `status` is a lagging field, so the query above can only ever
    // narrow candidates; this is what decides. An invitation that is still open
    // — pending and inside its validity window — is never deletable, whatever
    // its timestamps look like.
    if (!PURGEABLE_STATUSES.has(effectiveInvitationStatus(row))) {
      skipped++
      // ponytail: a skipped row keeps its slot under the cap on every future
      // run. Harmless at this volume; if a mass of them ever starves the sweep,
      // exclude them in the query rather than raising the cap.
      console.warn(
        `[cospeaker] retention sweep kept ${row._id}: still open or not resolved`,
      )
      continue
    }

    if (dryRun) {
      ids.push(row._id)
      continue
    }

    try {
      const result = await clientWrite.delete({
        query: PURGE_ONE_QUERY,
        params: { id: row._id, cutoff },
      })
      if ((result?.results?.length ?? 0) === 0) {
        // The document stopped matching between the read and this mutation —
        // renewed, or accepted. Leave it alone and say so.
        skipped++
        console.warn(
          `[cospeaker] retention sweep skipped ${row._id}: it changed mid-run`,
        )
        continue
      }
      deleted++
      ids.push(row._id)
    } catch (error) {
      failed++
      console.error(
        `[cospeaker] retention sweep could not delete ${row._id}`,
        error,
      )
    }
  }

  return {
    scanned: rows.length,
    deleted: dryRun ? 0 : deleted,
    skipped,
    failed,
    capped: rows.length >= MAX_DELETES_PER_RUN,
    dryRun,
    ids,
  }
}
