import 'server-only'
import type { Session } from 'next-auth'
import { clientReadUncached } from '@/lib/sanity/client'

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
      return { ...session, speaker: { ...speaker, ...good.rights } }
    }
    console.error(
      `[authz-deny] organizer refresh failed for speaker ${speaker._id}; denying organizer rights:`,
      error instanceof Error ? error.message : error,
    )
    rights = { organizerOrgIds: [], isOrganizer: false }
  }
  return { ...session, speaker: { ...speaker, ...rights } }
}

/** Test hook. */
export function clearOrganizerRightsMemo(): void {
  memo.clear()
  lastGood.clear()
}
