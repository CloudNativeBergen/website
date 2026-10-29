import 'server-only'
import type { Session } from 'next-auth'
import { isOrganizerForOrg } from '@/lib/authz/organizer'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

/** Who a trusted Wall Post came from (Photo Wall spec §6.6). */
export interface TrustedPoster {
  speakerId: string
  name: string
  role: 'organizer' | 'speaker'
  /** The organizer behind an impersonation (development only). */
  realAdminId?: string
}

/**
 * Whether the signed-in poster skips approval on THIS conference (§6.6): an
 * organizer of its organization, or a speaker with a confirmed talk at it.
 * Accepted but unconfirmed is not enough. The organization comes from the
 * Host's conference, never from the client. Null for anyone else.
 */
export async function trustedPoster(
  session: Session | null,
  conference: { _id: string; organization?: { _ref?: string } | null },
): Promise<TrustedPoster | null> {
  const speaker = session?.speaker
  if (!session || !speaker?._id) return null
  const base = {
    speakerId: speaker._id,
    name: speaker.name,
    ...(session.isImpersonating && session.realAdmin
      ? { realAdminId: session.realAdmin._id }
      : {}),
  }
  if (isOrganizerForOrg(speaker, conference.organization?._ref ?? null)) {
    return { ...base, role: 'organizer' }
  }
  const confirmedTalk = await scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId: conference._id },
    `*[_type == "talk" && !(_id in path("drafts.**")) && status == "confirmed" && $speakerId in speakers[]._ref][0]._id`,
    { speakerId: speaker._id },
  )
  return confirmedTalk ? { ...base, role: 'speaker' } : null
}
