import { Suspense } from 'react'
import { unstable_rethrow } from 'next/navigation'
import type { Conference } from '@/lib/conference/types'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from '@/lib/tickets/admin-access'
import { conferenceProviderType } from '@/lib/tickets/provider'
import { liveTicketTypeRolesOrThrow } from '@/lib/workshop/eligibility'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
import { WorkshopTicketsNotReady } from './WorkshopTicketsNotReady'
import {
  WorkshopTicketsFrame,
  WorkshopTicketsSection,
} from './WorkshopTicketsSection'

/**
 * The "Workshop tickets" section of `/admin/workshops` (#1332), with its data.
 *
 * STREAMED. The ticket types are one request to the ticketing provider, which
 * can be slow, and nothing else on the page waits for it: the frame (and the
 * anchor `/admin/tickets/types` links to) renders at once.
 */
export function WorkshopTickets({ conference }: { conference: Conference }) {
  return (
    <Suspense
      fallback={
        <WorkshopTicketsFrame>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Reading the ticket types…
          </p>
        </WorkshopTicketsFrame>
      }
    >
      <LoadedWorkshopTickets conference={conference} />
    </Suspense>
  )
}

/**
 * Exported for its tests only: a Suspense boundary cannot be rendered to
 * static markup with an async child inside it.
 *
 * THE SECTION FAILS ON ITS OWN. It streams inside `/admin/workshops`, and no
 * error boundary sits under `src/app`: an error that escaped here would take
 * the workshops, the sign-ups and the registration settings down with it. And
 * one can: resolving the ticketing provider throws when the per-organization
 * credential lookup refuses to guess (`TenantEnvSlugUnavailableError`). So
 * anything that goes wrong becomes the could-not-be-loaded state, which offers
 * no switch and blames nobody: the cause may be ours.
 */
export async function LoadedWorkshopTickets({
  conference,
}: {
  conference: Conference
}) {
  try {
    return await loadWorkshopTickets(conference)
  } catch (error) {
    // A redirect, a not-found or a bail-out to dynamic rendering is Next's own
    // signal, not a failure of this section.
    unstable_rethrow(error)
    console.error('Workshop tickets: the section could not be loaded:', error)
    return (
      <WorkshopTicketsSection
        list={null}
        providerLabel={ticketingProviderLabel(
          conferenceProviderType(conference),
        )}
        causeUnknown
      />
    )
  }
}

async function loadWorkshopTickets(conference: Conference) {
  // The provider-neutral read `/admin/tickets/types` uses, so both pages list
  // the same types for Checkin and Tito alike.
  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  // NOT READY IS NOT A FAILED READ: reloading never helps.
  if (access.state !== 'ready') {
    return (
      <WorkshopTicketsNotReady
        state={access.state}
        providerLabel={providerLabel}
      />
    )
  }

  let typeNames: string[]
  try {
    const { tickets } = await access.provider.fetchPublicTicketTypes(
      access.eventRef,
    )
    typeNames = [...tickets]
      .sort((a, b) => a.position - b.position)
      .map((ticket) => ticket.name)
  } catch (error) {
    unstable_rethrow(error)
    // UNREADABLE IS NOT EMPTY. Without the provider's types every stored
    // answer would look orphaned and the list would look empty, so nothing is
    // offered.
    console.error('Workshop tickets: ticket types could not be read:', error)
    return <WorkshopTicketsSection list={null} providerLabel={providerLabel} />
  }

  // LIVE, as the portal reads them: the page shows the answers the gate is
  // deciding from right now, including a Studio edit the cached conference has
  // not seen, and the refresh after a save shows that save. And STRICT, as the
  // portal's read is not: the gate falls back to the cached answers when this
  // read fails, an editor must not. A failure here throws, and the section
  // says it could not be loaded.
  const roles = await liveTicketTypeRolesOrThrow(conference)

  return (
    <WorkshopTicketsSection
      list={buildWorkshopTicketList(typeNames, roles)}
      providerLabel={providerLabel}
    />
  )
}
