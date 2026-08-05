import Link from 'next/link'
import { EyeSlashIcon } from '@heroicons/react/24/outline'
import { ACTIVATION_CHECKLIST_HREF } from '@/lib/settings/activation'

/**
 * Admin banner shown when the current conference is UNLISTED (M0 trial state).
 *
 * The admin area stays fully reachable regardless of visibility; this banner
 * just makes the state legible to organizers and points at the one thing they
 * should do next.
 *
 * WHICH THING DEPENDS ON WHETHER THEY CAN DO IT (#839). The link used to say
 * "Go live" unconditionally and deep-link to `/admin/settings#visibility` — an
 * anchor BELOW the activation checklist — so a tenant with no topics, dates,
 * venue or logo landed on the publish switch and nothing else. Now the CTA
 * tracks `readyToGoLive`: "Finish setup" onto the checklist while a required
 * row is outstanding, and only once they are all done does it become the
 * "Go live" jump to the switch.
 *
 * `readyToGoLive`, not `allDone`: an unlisted conference has the terminal
 * `visibility` row outstanding by definition, so `allDone` would keep the
 * banner on "Finish setup" forever — including for the one organizer it is
 * addressed to, whose only remaining step IS the switch.
 */
export function UnlistedBanner({
  readyToGoLive = false,
  settingsHref,
}: {
  /**
   * Every required checklist row except the launch switch itself is done (see
   * `ActivationChecklist.readyToGoLive`). Defaults to `false`: a caller that
   * has not resolved the checklist should send the organizer to the checklist,
   * never to a publish switch it cannot vouch for.
   */
  readyToGoLive?: boolean
  /** Override the CTA target (the stories and tests use it). */
  settingsHref?: string
}) {
  const href =
    settingsHref ??
    (readyToGoLive ? '/admin/settings#visibility' : ACTIVATION_CHECKLIST_HREF)

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <EyeSlashIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        This conference is <span className="font-semibold">unlisted</span> — it
        is not indexed by search engines and is only reachable by direct link.
      </span>
      <Link
        href={href}
        className="ml-auto shrink-0 font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 dark:text-amber-100 dark:hover:text-white"
      >
        {readyToGoLive ? 'Go live' : 'Finish setup'}
      </Link>
    </div>
  )
}
