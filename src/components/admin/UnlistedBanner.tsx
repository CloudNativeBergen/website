import Link from 'next/link'
import { EyeSlashIcon } from '@heroicons/react/24/outline'

/**
 * Admin banner shown when the current conference is UNLISTED (M0 trial state).
 *
 * The admin area stays fully reachable regardless of visibility; this banner
 * just makes the state legible to organizers and points at the settings toggle.
 * The "Go live" affordance is a PLACEHOLDER link to the Visibility card in
 * settings — the full activation checklist arrives in a later milestone.
 */
export function UnlistedBanner({
  settingsHref = '/admin/settings#visibility',
}: {
  /** Where the "Go live" link points (the Visibility settings card). */
  settingsHref?: string
}) {
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
        href={settingsHref}
        className="ml-auto shrink-0 font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 dark:text-amber-100 dark:hover:text-white"
      >
        Go live
      </Link>
    </div>
  )
}
