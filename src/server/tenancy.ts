import { TRPCError } from '@trpc/server'
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { resolveConferenceId, resolveOrganizationId } from './trpc'

/**
 * OWNERSHIP CHECKS FOR CLIENT-SUPPLIED DOCUMENT IDS (#730).
 *
 * Every admin mutation that takes a document `_id` from CLIENT INPUT must prove,
 * before it patches or deletes anything, that the document (a) exists, (b) is
 * the TYPE the endpoint claims to manage, and (c) belongs to the REQUEST's
 * tenant. Without that, `adminProcedure` only proves the caller is an organizer
 * of *some* org — the id itself is unvalidated, and Sanity's `patch`/`delete`
 * happily rewrite any document in the shared dataset regardless of type. An
 * organizer of tenant A could retitle or delete tenant B's `conference`.
 *
 * This generalises `getGalleryImageTenant` + `requireImageInConference` (#728),
 * which solved the same problem for one type. The tenancy dimensions differ per
 * document type, so {@link getDocumentTenant} projects all of them in one read
 * and the guards decide:
 *
 *   - `organization._ref`            — topic, staff, sponsor, message, …
 *   - `conference->organization._ref` — schedule, imageGallery, review, …
 *   - `organizations[]._ref`          — speaker (a person may belong to several
 *                                       tenants; see {@link requireSpeakerInCurrentOrg})
 *
 * FAIL CLOSED, always: an unresolvable request org, a missing document, a type
 * mismatch, a document with NO tenant key, or a failed read all refuse. A
 * refusal is `NOT_FOUND` — the caller is not entitled to learn that an id it
 * does not own exists.
 */

/** The tenancy dimensions of an arbitrary document, as read by id. */
export interface DocumentTenant {
  /** The document's `_type`. Never trusted from the client. */
  type: string | null
  /** Direct owner (`organization._ref`). */
  orgId: string | null
  /** The document's conference (`conference._ref`), when it hangs off one. */
  conferenceId: string | null
  /** Owner reached through the document's conference. */
  conferenceOrgId: string | null
  /** Membership list (`organizations[]._ref`) — speakers only. */
  memberOrgIds: string[]
}

/**
 * Resolve the tenancy of a CLIENT-SUPPLIED document id, or `null` when the
 * document does not exist. A by-id read whose only purpose is to be compared
 * with the request's tenant before a mutation is permitted.
 *
 * FAILS CLOSED on a read error: an unknown tenant must never authorize a write.
 */
export async function getDocumentTenant(
  id: string,
): Promise<DocumentTenant | null> {
  if (!id) return null
  try {
    // groq-global: resolves the tenant OF a client-supplied id so the caller can
    // compare it against the request's tenant (an ownership check, not a
    // listing). Scoping this query would defeat its purpose — it must be able to
    // see a foreign document in order to REFUSE it.
    const query = groq`*[_id == $id][0]{
      _type,
      "orgId": organization._ref,
      "conferenceId": conference._ref,
      "conferenceOrgId": conference->organization._ref,
      "memberOrgIds": coalesce(organizations, [])[]._ref
    }`
    const doc = await clientReadUncached.fetch<{
      _type?: string | null
      orgId?: string | null
      conferenceId?: string | null
      conferenceOrgId?: string | null
      memberOrgIds?: (string | null)[] | null
    } | null>(query, { id }, { cache: 'no-store' })
    if (!doc) return null
    return {
      type: doc._type ?? null,
      orgId: doc.orgId ?? null,
      conferenceId: doc.conferenceId ?? null,
      conferenceOrgId: doc.conferenceOrgId ?? null,
      memberOrgIds: (doc.memberOrgIds ?? []).filter(
        (ref): ref is string => typeof ref === 'string' && ref.length > 0,
      ),
    }
  } catch {
    // FAIL CLOSED: treat an unreadable document as one we do not own.
    return null
  }
}

/**
 * The REQUEST's organization id, or NOT_FOUND. `resolveOrganizationId` returns
 * `null` for an unresolvable host; no ownership decision may be made from that.
 */
export async function requireCurrentOrgId(): Promise<string> {
  const orgId = await resolveOrganizationId()
  if (!orgId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve organization from domain',
    })
  }
  return orgId
}

/** A refusal that never confirms whether the foreign id exists. */
function notFound(expectedType: string): TRPCError {
  return new TRPCError({
    code: 'NOT_FOUND',
    message: `No ${expectedType} with that id in this organization`,
  })
}

/**
 * Assert that a client-supplied id names an EXISTING document of `expectedType`
 * that belongs to the REQUEST's organization, and return that org id.
 *
 * Ownership is satisfied by either tenancy dimension: the document's own
 * `organization` ref, or the organization of the conference it hangs off. A
 * document carrying NEITHER is refused — an unowned document belongs to no
 * tenant, so no tenant may mutate it (this is the same posture #728 took for
 * conference-less gallery images, and it matches the already-strict staff and
 * gallery READ scoping, which never surface org-less rows either).
 *
 * Speakers are deliberately NOT handled here — they are shared across tenants
 * and have their own rule. Use {@link requireSpeakerInCurrentOrg}.
 */
export async function requireDocumentInCurrentOrg(
  id: string,
  expectedType: string,
): Promise<string> {
  const orgId = await requireCurrentOrgId()
  const tenant = await getDocumentTenant(id)
  if (!tenant || tenant.type !== expectedType) throw notFound(expectedType)
  const owner = tenant.orgId ?? tenant.conferenceOrgId
  if (!owner || owner !== orgId) throw notFound(expectedType)
  return orgId
}

/**
 * The tighter, CONFERENCE-level form of {@link requireDocumentInCurrentOrg}, for
 * documents that hang off a conference and whose sibling endpoints already scope
 * that way (`schedule.delete`, `getSponsorForCurrentConference`,
 * `requireImageInConference`). Use it where an edition boundary is meaningful;
 * use the org form where an organizer legitimately works across their editions.
 *
 * FAILS CLOSED identically: unresolvable conference, missing document, wrong
 * type, or a document with no conference all refuse.
 */
export async function requireDocumentInCurrentConference(
  id: string,
  expectedType: string,
): Promise<string> {
  const conferenceId = await resolveConferenceId()
  const tenant = await getDocumentTenant(id)
  if (!tenant || tenant.type !== expectedType) throw notFound(expectedType)
  if (!tenant.conferenceId || tenant.conferenceId !== conferenceId) {
    throw notFound(expectedType)
  }
  return conferenceId
}

/**
 * The PLURAL form, for bulk mutations that take a list of ids. Refuses the WHOLE
 * batch unless EVERY id is an existing `expectedType` in the request's
 * conference — a partial apply would silently perform the cross-tenant half of
 * the request while reporting success.
 */
export async function requireDocumentsInCurrentConference(
  ids: string[],
  expectedType: string,
): Promise<string> {
  const conferenceId = await resolveConferenceId()
  if (ids.length === 0) return conferenceId
  let owned = 0
  try {
    // groq-global-scoped: the tenant predicate IS `conference._ref ==
    // $conferenceId`; it counts how many of the SUPPLIED ids are ours.
    owned =
      (await clientReadUncached.fetch<number>(
        groq`count(*[_id in $ids && _type == $expectedType && conference._ref == $conferenceId])`,
        { ids, expectedType, conferenceId },
        { cache: 'no-store' },
      )) ?? 0
  } catch {
    // FAIL CLOSED: an unreadable probe authorizes nothing.
    owned = -1
  }
  if (owned !== new Set(ids).size) throw notFound(expectedType)
  return conferenceId
}

/**
 * SPEAKER ownership, which is membership rather than exclusivity: the same human
 * can belong to several tenants, so a speaker is on this org's admin surface
 * when they are an explicit member (`organizations[]._ref`) OR, as the
 * pre-044-backfill fallback, they have a talk at one of the org's conferences.
 * These are exactly the terms of `SPEAKER_ORG_FILTER` in
 * `src/lib/speaker/sanity.ts`, which decides which speakers the admin lists show
 * — so this guard admits precisely the set the organizer can already see and
 * refuses everything else.
 *
 * PARTICIPATION IS ONLY SAFE BECAUSE IT IS NO LONGER CLIENT-WRITABLE. The
 * participation arm is a predicate the caller could otherwise satisfy on demand:
 * write a foreign speaker's id into your own talk's `speakers[]` and you "own"
 * them. Every write that puts a speaker id into a reference field now goes
 * through {@link requireSpeakersInCurrentOrg} first, so participation can only
 * be created for a speaker the caller ALREADY had standing over. Do not add a
 * new speaker-reference write without that guard — see
 * `src/server/routers/tenancy.speakerRefs.test.ts`, which pins the set.
 *
 * `requireExclusive` additionally refuses a speaker ANOTHER org also has
 * standing over. Deleting or merging a shared person is destructive to that
 * other tenant even though this one legitimately has standing. Exclusivity is
 * computed over the SAME dimensions as ownership (membership ∪ participation):
 * checking only membership left the pre-backfill population — a speaker with a
 * talk at B but no B membership — mergeable and deletable by A.
 */
export async function requireSpeakerInCurrentOrg(
  id: string,
  opts: { requireExclusive?: boolean } = {},
): Promise<string> {
  const orgId = await requireCurrentOrgId()
  const tenant = await getDocumentTenant(id)
  if (!tenant || tenant.type !== 'speaker') throw notFound('speaker')

  const isMember = tenant.memberOrgIds.includes(orgId)
  // The participation set is needed whenever membership does not settle
  // ownership, and ALWAYS for exclusivity (which must see OTHER orgs' talks).
  const needParticipation = !isMember || opts.requireExclusive === true
  const participationOrgIds = needParticipation
    ? await speakerParticipationOrgIds(id)
    : []

  if (!isMember && !(participationOrgIds ?? []).includes(orgId)) {
    throw notFound('speaker')
  }

  if (opts.requireExclusive) {
    if (participationOrgIds === null) {
      // FAIL CLOSED: we could not prove the speaker is exclusive to this org, so
      // we must not let a destructive operation proceed.
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Could not verify that this speaker belongs only to this ' +
          'organization. Try again.',
      })
    }
    const foreign = new Set(
      [...tenant.memberOrgIds, ...participationOrgIds].filter(
        (ref) => ref !== orgId,
      ),
    )
    if (foreign.size > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'This speaker also belongs to another organization. Removing them ' +
          'here would delete a person another tenant still owns.',
      })
    }

    // THE REFERENCE GRAPH, not just the membership list. `mergeSpeakers`
    // enumerates `*[references($loserId)]` with NO tenant predicate and rewrites
    // every hit in one transaction, so exclusivity has to bound the set the
    // transaction will actually touch — a `conference` that lists the person as
    // an organizer, a `review`, a `conversation`. Documents that carry no
    // resolvable owner cannot be attributed and are not counted; membership ∪
    // participation above remains the primary control.
    if ((await foreignReferencingDocCount(id, orgId)) !== 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Another organization’s documents still reference this speaker. ' +
          'Removing them here would rewrite that tenant’s data.',
      })
    }
  }

  return orgId
}

/**
 * How many documents OUTSIDE `orgId` reference this speaker. Returns `-1` on a
 * read error so the caller FAILS CLOSED.
 */
async function foreignReferencingDocCount(
  id: string,
  orgId: string,
): Promise<number> {
  try {
    // groq-global: deliberately unscoped at the root — its whole job is to see
    // OTHER tenants' documents in order to refuse a destructive operation.
    const query = groq`count(*[references($id) && _id != $id && defined(coalesce(organization._ref, conference->organization._ref)) && coalesce(organization._ref, conference->organization._ref) != $orgId])`
    const count = await clientReadUncached.fetch<number>(
      query,
      { id, orgId },
      { cache: 'no-store' },
    )
    return count ?? -1
  } catch {
    return -1
  }
}

/**
 * The participation half of the speaker rule: WHICH organizations own a
 * conference this speaker has a talk at. Returns `null` on a read error so the
 * caller can fail closed in both directions — an unreadable probe must neither
 * grant ownership nor certify exclusivity.
 */
async function speakerParticipationOrgIds(
  speakerId: string,
): Promise<string[] | null> {
  try {
    // groq-global: an ownership probe for a client-supplied speaker id, not a
    // listing. It must be able to see OTHER tenants' talks in order to REFUSE a
    // destructive operation on a person they also have standing over.
    const query = groq`*[_type == "talk" && references($speakerId)].conference->organization._ref`
    const refs = await clientReadUncached.fetch<(string | null)[] | null>(
      query,
      { speakerId },
      { cache: 'no-store' },
    )
    return Array.from(
      new Set(
        (refs ?? []).filter(
          (ref): ref is string => typeof ref === 'string' && ref.length > 0,
        ),
      ),
    )
  } catch {
    return null
  }
}

/**
 * REFERENCE-INJECTION GUARD for speaker ids. Every id the caller asks us to
 * write into a `speakers[]` / `organizers[]` / `featuredSpeakers[]` reference
 * field must name an existing `speaker` this org already has standing over.
 *
 * Without this, `adminProcedure` + a bare `{_type:'reference', _ref: id}` let an
 * organizer of A publish (and, through the participation arm of
 * {@link requireSpeakerInCurrentOrg}, then OWN) any person in the shared
 * dataset. Sanity only enforces that a strong reference resolves — not its type
 * and not its tenant.
 *
 * The admitted set is exactly the corpus the admin speaker pickers already
 * show — `SPEAKER_ORG_FILTER` (membership ∨ participation) UNION this org's
 * current organizers, which `speaker.admin.search` merges in. Anything the
 * organizer can pick, they can reference; nothing else. The organizer arm
 * matters for `conference.updateOrganizers`: a sitting organizer who has never
 * spoken and whose `organizations[]` was never stamped would otherwise become
 * unremovable-and-unsavable, breaking a live edition.
 *
 * It is NOT a self-grant vector: `organizers[]` can only be written through
 * this same guard, and referencing standing is deliberately WIDER than the
 * ownership standing {@link requireSpeakerInCurrentOrg} grants — pointing at a
 * person is not the same as being allowed to rewrite them.
 *
 * ALL-OR-NOTHING and FAIL CLOSED: one foreign or non-existent id refuses the
 * whole write, and an unreadable probe refuses too.
 */
export async function requireSpeakersInCurrentOrg(
  ids: string[],
): Promise<string> {
  const orgId = await requireCurrentOrgId()
  // A blank id in a reference array is never legitimate input, and dropping it
  // silently would let the count below pass on fewer distinct documents.
  if (ids.some((id) => !id)) throw notFound('speaker')
  const unique = Array.from(new Set(ids))
  if (unique.length === 0) return orgId
  let owned = 0
  try {
    // groq-global-scoped: the tenant predicate is the membership-or-participation
    // disjunction, exactly the terms of `requireSpeakerInCurrentOrg`. Counts how
    // many of the SUPPLIED ids this org may reference.
    owned =
      (await clientReadUncached.fetch<number>(
        groq`count(*[_id in $ids && _type == "speaker" && ($orgId in coalesce(organizations, [])[]._ref || count(*[_type == "talk" && references(^._id) && conference->organization._ref == $orgId]) > 0 || count(*[_type == "conference" && organization._ref == $orgId && ^._id in organizers[]._ref]) > 0)])`,
        { ids: unique, orgId },
        { cache: 'no-store' },
      )) ?? 0
  } catch {
    // FAIL CLOSED: an unreadable probe authorizes nothing.
    owned = -1
  }
  if (owned !== unique.length) throw notFound('speaker')
  return orgId
}

/**
 * The same guard for ids written into a reference field of a NON-speaker type
 * that is owned directly by an organization (`topic`, …). Same posture as
 * {@link requireDocumentsInCurrentConference}, one dimension up.
 */
export async function requireDocumentsInCurrentOrg(
  ids: string[],
  expectedType: string,
): Promise<string> {
  const orgId = await requireCurrentOrgId()
  const unique = Array.from(new Set(ids.filter((id) => Boolean(id))))
  if (unique.length === 0) return orgId
  let owned = 0
  try {
    // groq-global-scoped: the tenant predicate IS the `organization._ref` /
    // `conference->organization._ref` disjunction below.
    owned =
      (await clientReadUncached.fetch<number>(
        groq`count(*[_id in $ids && _type == $expectedType && coalesce(organization._ref, conference->organization._ref) == $orgId])`,
        { ids: unique, expectedType, orgId },
        { cache: 'no-store' },
      )) ?? 0
  } catch {
    owned = -1
  }
  if (owned !== unique.length) throw notFound(expectedType)
  return orgId
}
