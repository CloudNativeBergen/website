import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * Whether the organization has content judgement on (spec §5), read LIVE:
 * the client's gate runs it before every call, so turning the setting off
 * stops new calls at once, with no cache in between.
 *
 * FAILS CLOSED: a failed read answers `false`, so nothing is sent. (The
 * /privacy disclosure reads the same field the other way round: there a
 * failed read discloses OpenRouter as possible.)
 */
export async function isContentJudgementEnabled(
  orgId: string,
): Promise<boolean> {
  try {
    const enabled = await clientReadUncached.fetch<boolean | null>(
      // groq-global: the organization document IS the tenant (id-keyed read
      // of the server-resolved organization).
      `*[_type == "organization" && _id == $orgId][0].contentJudgement.enabled`,
      { orgId },
    )
    return enabled === true
  } catch {
    console.error(
      `[content-judgement] setting read failed for ${orgId}; not judging`,
    )
    return false
  }
}
