import 'server-only'
import type { Session } from 'next-auth'
import { clientReadUncached } from '@/lib/sanity/client'
import { requestDomain } from '@/lib/conference/request-domain'
import { orgAuthority } from './identity-members'
import { resolveCurrentOrgId } from './organizer'

// Live organizer rights for the NextAuth lane (#1923). The login token carries
// `organizerOrgIds` and rolls for 30 days with the same claims, so a removed
// organizer would keep /admin. getAuthSession re-reads the rights here instead.
const TTL_MS = 60_000
// Owner decision: if Sanity is down, reuse the last successful read for up to
// 10 minutes, then fail closed. Kept apart from the memo so it never extends
// normal staleness.
const GRACE_MS = 10 * 60_000

// Same query as ORGANIZER_ORG_IDS_FIELD / the isOrganizer field in
// src/lib/speaker/sanity.ts, for one speaker.
const ORGS =
  '"organizerOrgIds": *[_type == "conference" && !(_id in path("drafts.**")) && $id in organizers[]._ref && defined(organization._ref)].organization._ref' // groq-global: must see every org this speaker organizes; projects only org refs.
const ANY =
  '"isOrganizer": count(*[_type == "conference" && !(_id in path("drafts.**")) && $id in organizers[]._ref]) > 0' // groq-global: platform-wide organizer bit, a boolean only.
const QUERY = `{ ${ORGS}, ${ANY} }`

type Rights = { organizerOrgIds: string[]; isOrganizer: boolean }

// ponytail: per-instance memo, same as identity-session. Revocation shows up
// within TTL_MS. Move to a shared cache if instances multiply.
const memo = new Map<string, { at: number; rights: Promise<Rights> }>()
const lastGood = new Map<string, { at: number; rights: Rights }>()

function rightsFor(id: string): Promise<Rights> {
  const hit = memo.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rights
  const rights = clientReadUncached.fetch<Rights>(QUERY, { id }).then((r) => ({
    organizerOrgIds: Array.from(
      new Set((r?.organizerOrgIds ?? []).filter(Boolean)),
    ),
    isOrganizer: r?.isOrganizer === true,
  }))
  rights.then(
    (r) => {
      if (lastGood.size > 1000) lastGood.clear()
      lastGood.set(id, { at: Date.now(), rights: r })
    },
    () => {},
  )
  if (memo.size > 1000) memo.clear()
  memo.set(id, { at: Date.now(), rights })
  // A failed read is not an answer: retry on the next request.
  // Only evict this promise, not a newer entry set meanwhile.
  rights.catch(() => {
    if (memo.get(id)?.rights === rights) memo.delete(id)
  })
  return rights
}

/**
 * Replace the token's organizer claims with the current ones. If the read fails,
 * reuse the last good read when under GRACE_MS old; otherwise fail closed.
 */
export async function withLiveOrganizerRights<S extends Session | null>(
  session: S,
): Promise<S> {
  const speaker = session?.speaker
  if (!session || !speaker?._id) return session
  let rights: Rights
  try {
    rights = await rightsFor(speaker._id)
  } catch (error) {
    const good = lastGood.get(speaker._id)
    if (good && Date.now() - good.at < GRACE_MS) {
      console.warn(
        `[authz-grace] organizer refresh failed for speaker ${speaker._id}; using last good read`,
      )
      return {
        ...session,
        speaker: { ...speaker, ...(await identitySource(good.rights)) },
      }
    }
    console.error(
      `[authz-deny] organizer refresh failed for speaker ${speaker._id}; denying organizer rights:`,
      error instanceof Error ? error.message : error,
    )
    rights = { organizerOrgIds: [], isOrganizer: false }
  }
  return {
    ...session,
    speaker: { ...speaker, ...(await identitySource(rights)) },
  }
}

// Last member source seen per host, for an identity outage (#2101).
const lastSource = new Map<string, { at: number; identitySource: boolean }>()

/**
 * Phase 1b (#2101): when identity owns the request org's roles, the org is in
 * organizerOrgIds only if identity says owner or admin; Sanity organizers[]
 * no longer counts for it. Other orgs are untouched: every check is for the
 * request org. If identity cannot be read, the request org is withheld (fail
 * closed), unless this host was seen unswitched within GRACE_MS.
 */
async function identitySource(
  rights: Rights,
): Promise<Rights & { adminDenyReason?: 'unavailable' | 'konf_sign_in' }> {
  let host: string
  let orgId: string | null
  try {
    host = await requestDomain()
    orgId = await resolveCurrentOrgId()
  } catch {
    return rights // outside a request: no request org to decide for
  }
  if (!host || !orgId) return rights
  const others = rights.organizerOrgIds.filter((o) => o !== orgId)
  const withheld = (adminDenyReason?: 'unavailable' | 'konf_sign_in') => ({
    organizerOrgIds: others,
    isOrganizer: others.length > 0,
    ...(adminDenyReason && { adminDenyReason }),
  })
  try {
    const a = await orgAuthority(host)
    if (!a) return rights // no gateway on this environment
    if (lastSource.size > 1000) lastSource.clear()
    lastSource.set(host, { at: Date.now(), identitySource: a.identitySource })
    if (!a.identitySource) return rights
    if (a.admin)
      return { organizerOrgIds: [...others, orgId], isOrganizer: true }
    return withheld(a.signedIn ? undefined : 'konf_sign_in')
  } catch (error) {
    const seen = lastSource.get(host)
    if (seen && !seen.identitySource && Date.now() - seen.at < GRACE_MS)
      return rights
    console.error(
      `[authz-deny] identity member source unreadable for ${host}; withholding org ${orgId}:`,
      error instanceof Error ? error.message : error,
    )
    return withheld('unavailable')
  }
}

/** Test hook. */
export function clearOrganizerRightsMemo(): void {
  memo.clear()
  lastGood.clear()
  lastSource.clear()
}
