import { clientReadUncached } from '@/lib/sanity/client'
import {
  ceilingWarnings,
  describeCeilingWarning,
  eventWeekOf,
  warningsTouching,
  type CeilingWarning,
} from './ceilings'
import { resolveAllMilestones, type MilestoneSource } from './milestones'
import { MARKETING_CHANNELS, type MarketingChannel } from './types'

/**
 * Channel ceilings against what is actually scheduled (spec §5.4): every
 * dated LinkedIn and Bluesky variant of the conference, with the key of the
 * Task that owns it when one does (a countdown is recognised by its key).
 */

// groq-global-scoped: a by-id read of the conference itself, the tenant key.
const CONFERENCE_ROOT = `*[_type == "conference" && _id == $conferenceId][0]{
  startDate, endDate, cfpStartDate, cfpEndDate, cfpNotifyDate, programDate,
  earlyBirdEndDate, registrationCloseDate, speakersAnnouncedDate,
  sponsorDeadlineDate, recordingsLiveDate, ticketTargets
}`
const VARIANTS_ROOT = `*[_type == "socialPostVariant" && conference._ref == $conferenceId && defined(scheduledAt) && platform in $channels && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
  _id, platform, scheduledAt, "postId": post._ref
}`
const TASK_KEYS_ROOT = `*[_type == "marketingTask" && conference._ref == $conferenceId && kind == "publishing" && defined(variant) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
  key, "variantId": variant._ref
}`

interface CeilingRead {
  conference: MilestoneSource | null
  variants:
    | {
        _id: string
        platform: MarketingChannel
        scheduledAt: string
        postId: string | null
      }[]
    | null
  tasks: { key: string | null; variantId: string | null }[] | null
}

async function readCeilings(
  conferenceId: string,
): Promise<{ warnings: CeilingWarning[]; read: CeilingRead } | null> {
  const read = await clientReadUncached.fetch<CeilingRead | null>(
    `{ "conference": ${CONFERENCE_ROOT}, "variants": ${VARIANTS_ROOT}, "tasks": ${TASK_KEYS_ROOT} }`,
    { conferenceId, channels: [...MARKETING_CHANNELS] },
    { cache: 'no-store' },
  )
  if (!read?.conference) return null
  const keyByVariant = new Map(
    (read.tasks ?? []).flatMap((t) =>
      t.key && t.variantId ? [[t.variantId, t.key] as const] : [],
    ),
  )
  const warnings = ceilingWarnings(
    (read.variants ?? []).map((v) => ({
      variantId: v._id,
      channel: v.platform,
      at: v.scheduledAt,
      taskKey: keyByVariant.get(v._id) ?? null,
    })),
    eventWeekOf(resolveAllMilestones(read.conference)),
  )
  return { warnings, read }
}

/** Every ceiling the conference's scheduled posts go over, as sentences. */
export async function channelCeilingWarnings(
  conferenceId: string,
): Promise<string[]> {
  const result = await readCeilings(conferenceId)
  return (result?.warnings ?? []).map(describeCeilingWarning)
}

/**
 * The ceiling warnings a scheduling touches, named by variant or by post (a
 * post's default time moves every variant that follows it). BEST-EFFORT: a
 * ceiling never blocks, so a failure to compute one is an empty list, never
 * an error on the write that already landed.
 */
export async function ceilingWarningsFor(
  conferenceId: string,
  match: { variantIds?: string[]; postIds?: string[] },
): Promise<string[]> {
  try {
    const result = await readCeilings(conferenceId)
    if (!result) return []
    const posts = new Set(match.postIds ?? [])
    const variantIds = [
      ...(match.variantIds ?? []),
      ...(result.read.variants ?? [])
        .filter((v) => v.postId && posts.has(v.postId))
        .map((v) => v._id),
    ]
    if (variantIds.length === 0) return []
    return warningsTouching(result.warnings, variantIds).map(
      describeCeilingWarning,
    )
  } catch (error) {
    console.error('Channel ceiling check failed', error)
    return []
  }
}
