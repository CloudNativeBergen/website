import Link from 'next/link'
import { TicketIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/EmptyState'
import { PLATFORM_NAME } from '@/lib/branding/platform'

/**
 * The organizer-facing empty states for the ticketing surfaces — the honest
 * alternative to the red `ErrorDisplay "Checkin.no Configuration Error"` every
 * ticket page used to render whenever the provider did not resolve.
 *
 * Three states, matching {@link import('@/lib/tickets/admin-access')}'s
 * resolution (and the budget page's empty ≠ error ≠ unavailable rule):
 *
 * - `unconfigured` — the org MAY use ticketing but this conference is not bound
 *   to an event yet. Actionable: it links straight to the ticketing settings.
 * - `unavailable` — the org has no ticketing integration at all. There is
 *   nothing to configure, so there is no settings link to offer; saying so
 *   plainly beats sending an organizer to a form that cannot help.
 * - `unsupported` — the surface exists but this conference's vendor has no
 *   equivalent (discount codes are a Checkin-only API).
 *
 * NONE of these is an error: no red frame, no exclamation mark, and the page
 * keeps its own header so the organizer stays oriented.
 */
export type TicketingNoticeState =
  'unconfigured' | 'unavailable' | 'unsupported'

interface TicketingStateNoticeProps {
  state: TicketingNoticeState
  /** Vendor label for the copy, e.g. `Checkin.no` or `Tito`. */
  providerLabel: string
  /**
   * What this page would have shown, as a plural noun phrase — "ticket sales",
   * "orders", "ticket types". Keeps the copy specific to the page an organizer
   * is actually standing on.
   */
  surface: string
}

const SETTINGS_HREF = '/admin/settings#tickets-registration'

export function TicketingStateNotice({
  state,
  providerLabel,
  surface,
}: TicketingStateNoticeProps) {
  const copy: { title: string; description: string } =
    state === 'unconfigured'
      ? {
          title: 'Ticketing is not connected yet',
          description: `Connect this conference to its ${providerLabel} event in the ticket settings and ${surface} will show up here.`,
        }
      : state === 'unsupported'
        ? {
            title: `${providerLabel} does not support this`,
            description: `${surface.charAt(0).toUpperCase()}${surface.slice(1)} are managed in Checkin.no. This conference sells tickets through ${providerLabel}, so manage them in ${providerLabel} instead.`,
          }
        : {
            title: 'Ticketing is not available for your organization',
            description: `Your organization does not have ${PLATFORM_NAME}'s ticketing integration enabled, so there are no ${surface} to show. Everything else in the admin area works as usual.`,
          }

  return (
    <EmptyState
      icon={TicketIcon}
      title={copy.title}
      description={copy.description}
      className="rounded-lg bg-white p-12 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
      action={
        state === 'unconfigured' ? (
          <Link
            href={SETTINGS_HREF}
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-400"
          >
            Open ticket settings
          </Link>
        ) : undefined
      }
    />
  )
}
