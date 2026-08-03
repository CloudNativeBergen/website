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
 * `requireExclusive` additionally refuses a speaker who belongs to ANOTHER org
 * too. Deleting or merging a shared person is destructive to that other tenant
 * even though this one legitimately has standing, so those endpoints pass it.
 */
export async function requireSpeakerInCurrentOrg(
  id: string,
  opts: { requireExclusive?: boolean } = {},
): Promise<string> {
  const orgId = await requireCurrentOrgId()
  const tenant = await getDocumentTenant(id)
  if (!tenant || tenant.type !== 'speaker') throw notFound('speaker')

  const isMember = tenant.memberOrgIds.includes(orgId)
  if (!isMember && !(await speakerHasTalkInOrg(id, orgId))) {
    throw notFound('speaker')
  }

  if (opts.requireExclusive) {
    const foreign = tenant.memberOrgIds.filter((ref) => ref !== orgId)
    if (foreign.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'This speaker also belongs to another organization. Removing them ' +
          'here would delete a person another tenant still owns.',
      })
    }
  }

  return orgId
}

/**
 * The participation half of the speaker rule: does this speaker have a talk at
 * any conference owned by `orgId`? FAILS CLOSED (`false`) on a read error.
 */
async function speakerHasTalkInOrg(
  speakerId: string,
  orgId: string,
): Promise<boolean> {
  try {
    // Not actually global — the tenant predicate is the JOINED
    // `conference->organization._ref == $orgId`, which the rule cannot see
    // because the root filter is on `talk`. An ownership probe for a
    // client-supplied speaker id, not a listing.
    // groq-global: see above.
    const query = groq`count(*[_type == "talk" && references($speakerId) && conference->organization._ref == $orgId])`
    const count = await clientReadUncached.fetch<number>(
      query,
      { speakerId, orgId },
      { cache: 'no-store' },
    )
    return (count ?? 0) > 0
  } catch {
    return false
  }
}
