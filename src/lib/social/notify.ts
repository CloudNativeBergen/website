import { createNotifications } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import type { PublishableVariant } from './store'
import { SOCIAL_PLATFORM_LABELS } from './types'

/** The organizer surface every social deep link lands on. */
export const SOCIAL_POSTS_PATH = '/admin/marketing/posts'

/**
 * The copy-ready view for one variant: the posts page with the manual
 * dialog opened on it (`SocialPostsManager` reads the `variant` query).
 */
export function manualPostPath(variantId: string): string {
  return `${SOCIAL_POSTS_PATH}?variant=${encodeURIComponent(variantId)}`
}

/** Body excerpt in the hub row; the full text lives in the view. */
const EXCERPT_MAX = 140

/**
 * Pure: the hub inputs for variants a tick handed to organizers (#1006,
 * spec §3.3 "Due"). ONE notification per variant, to the post's creator —
 * the assignee until the Task layer (#992) carries its own. A variant whose
 * post has no creator (erased, gone, cross-tenant) notifies nobody rather
 * than every organizer: the row still shows "Post by hand" on the page.
 * The cron is the actor, so no `actorId`; the recipient is the assignee,
 * not the actor, so no exclusion applies.
 */
export function manualDueNotifications(
  variants: readonly PublishableVariant[],
): NotificationInput[] {
  const items: NotificationInput[] = []
  for (const variant of variants) {
    if (!variant.postCreatedBy) continue
    const platform = SOCIAL_PLATFORM_LABELS[variant.platform]
    const body = variant.body.trim()
    items.push({
      recipientId: variant.postCreatedBy,
      conferenceId: variant.conferenceId,
      notificationType: 'social_manual_due',
      title: `Post by hand on ${platform}`,
      message:
        body.length > EXCERPT_MAX
          ? `${truncateToGraphemeBoundary(body, EXCERPT_MAX - 1)}…`
          : body,
      link: manualPostPath(variant._id),
    })
  }
  return items
}

/**
 * The tick's `onAwaitingManual` hook: in-app hub + web push, one
 * transaction for the whole tick. `createNotifications` never throws, so a
 * hub outage cannot touch the variants (they are already `awaiting-manual`
 * and visible on the page). Returns the number of hub rows persisted.
 */
export async function notifyAwaitingManual(
  variants: readonly PublishableVariant[],
): Promise<number> {
  return createNotifications(manualDueNotifications(variants))
}
