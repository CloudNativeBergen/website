import Link from 'next/link'
import { TicketIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/EmptyState'
import { PLATFORM_NAME } from '@/lib/branding/platform'

/**
 * The organizer-facing empty states for the ticketing surfaces — the honest
 * alternative to the red `ErrorDisplay "Checkin.no Configuration Error"` every
 * ticket page used to render whenever the provider did not resolve.
 *
 * Four states, matching {@link import('@/lib/tickets/admin-access')}'s
 * resolution (and the budget page's empty ≠ error ≠ unavailable rule):
 *
 * - `unconfigured` — the org MAY use ticketing but this conference is not bound
 *   to an event yet. Actionable: it links straight to the ticketing settings.
 * - `unavailable` — the org has no ticketing integration at all. There is
 *   nothing to configure, so there is no settings link to offer; saying so
 *   plainly beats sending an organizer to a form that cannot help.
 * - `disabled` — the org HAD ticketing and an operator switched it off. Kept
 *   separate from `unavailable` on purpose: "not available for your
 *   organization" is the truth for a tenant that never had it, and a lie to one
 *   whose sales pages worked yesterday. This copy names what happened and who
 *   can undo it, and promises nothing was deleted — the deny hides OUR surface,
 *   it does not touch the tenant's own provider account.
 * - `unsupported` — the surface exists but this conference's vendor has no
 *   equivalent (discount codes are a Checkin-only API).
 *
 * NONE of these is an error: no red frame, no exclamation mark, and the page
 * keeps its own header so the organizer stays oriented.
 */
export type TicketingNoticeState =
  'unconfigured' | 'unavailable' | 'disabled' | 'unsupported'

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

/** Sentence-cases a `surface` noun phrase for use at the start of a title. */
function capitalize(surface: string): string {
  return surface.charAt(0).toUpperCase() + surface.slice(1)
}

export function TicketingStateNotice({
  state,
  providerLabel,
  surface,
}: TicketingStateNoticeProps) {
  const copy: Record<
    TicketingNoticeState,
    { title: string; description: string }
  > = {
    unconfigured: {
      title: 'Ticketing is not connected yet',
      description: `Connect this conference to its ${providerLabel} event in the ticket settings and ${surface} will show up here.`,
    },
    // NAMES ONLY THIS CONFERENCE'S OWN VENDOR. An earlier draft said the
    // surface was "managed in Checkin.no", which is exactly backwards: this
    // state fires when the CURRENT provider is the one our integration cannot
    // drive, so pointing a Tito organizer at Checkin.no sends them somewhere
    // they have no account.
    unsupported: {
      title: `${capitalize(surface)} are not available for ${providerLabel}`,
      description: `${PLATFORM_NAME} cannot manage ${surface} for ${providerLabel} events. Create and manage them in your ${providerLabel} dashboard instead — ticket sales here are unaffected.`,
    },
    // A DELIBERATE OFF SWITCH, said out loud. This org may have been running
    // sales through us yesterday, so it gets the fact ("turned off"), the
    // remedy (whom to ask) and the reassurance that the deny only hid our
    // surface. NO vendor name here: unlike `unsupported` this state does not
    // depend on which provider the conference picked, and a denied org that
    // never chose one would be told about a vendor it has no account with.
    disabled: {
      title: 'Ticketing has been turned off for your organization',
      description: `${PLATFORM_NAME}'s ticketing integration is switched off for your organization, so ${surface} are not shown here. Nothing has been deleted and your ticketing provider account is untouched — ask your ${PLATFORM_NAME} administrator to turn it back on.`,
    },
    unavailable: {
      title: 'Ticketing is not available for your organization',
      description: `Your organization does not have ${PLATFORM_NAME}'s ticketing integration enabled, so there are no ${surface} to show. Everything else in the admin area works as usual.`,
    },
  }

  return (
    <EmptyState
      icon={TicketIcon}
      title={copy[state].title}
      description={copy[state].description}
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
