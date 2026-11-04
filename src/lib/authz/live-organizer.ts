import 'server-only'
import type { Session } from 'next-auth'
import { clientReadUncached } from '@/lib/sanity/client'

// Live organizer rights for the NextAuth lane (#1923). The login token carries
// `organizerOrgIds` and rolls for 30 days with the same claims, so a removed
// organizer would keep /admin. getAuthSession re-reads the rights here instead.
const TTL_MS = 60_000

// Same query as ORGANIZER_ORG_IDS_FIELD / the isOrganizer field in
// src/lib/speaker/sanity.ts, for one speaker.
const QUERY = `{
  "organizerOrgIds": *[_type == "conference" && $id in organizers[]._ref && defined(organization._ref)].organization._ref,
  "isOrganizer": count(*[_type == "conference" && $id in organizers[]._ref]) > 0
}` // groq-global: rights span every org this speaker organizes; projects only org refs.

type Rights = { organizerOrgIds: string[]; isOrganizer: boolean }

// ponytail: per-instance memo, same as identity-session. Revocation shows up
// within TTL_MS. Move to a shared cache if instances multiply.
const memo = new Map<string, { at: number; rights: Promise<Rights> }>()

function rightsFor(id: string): Promise<Rights> {
  const hit = memo.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rights
  const rights = clientReadUncached
    .fetch<Rights>(QUERY, { id })
    .then((r) => ({
      organizerOrgIds: Array.from(
        new Set((r?.organizerOrgIds ?? []).filter(Boolean)),
      ),
      isOrganizer: r?.isOrganizer === true,
    }))
  if (memo.size > 1000) memo.clear()
  memo.set(id, { at: Date.now(), rights })
  // A failed read is not an answer: retry on the next request.
  rights.catch(() => memo.delete(id))
  return rights
}

/**
 * Replace the token's organizer claims with the current ones. Fails closed: if
 * the read fails, the session has no organizer rights for this request.
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
}
