import { Suspense } from 'react'
import type { Conference } from '@/lib/conference/types'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from '@/lib/tickets/admin-access'
import { liveTicketTypeRoles } from '@/lib/workshop/eligibility'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
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
 * Exported for its test only: a Suspense boundary cannot be rendered to static
 * markup with an async child inside it.
 */
export async function LoadedWorkshopTickets({
  conference,
}: {
  conference: Conference
}) {
  // The provider-neutral read `/admin/tickets/types` uses, so both pages list
  // the same types for Checkin and Tito alike.
  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  let typeNames: string[] | null = null
  if (access.state === 'ready') {
    try {
      const { tickets } = await access.provider.fetchPublicTicketTypes(
        access.eventRef,
      )
      typeNames = [...tickets]
        .sort((a, b) => a.position - b.position)
        .map((ticket) => ticket.name)
    } catch (error) {
      console.error('Workshop tickets: ticket types could not be read:', error)
    }
  }

  // UNREADABLE IS NOT EMPTY. Without the provider's types every stored answer
  // would look orphaned and the list would look empty, so nothing is offered.
  if (!typeNames) {
    return <WorkshopTicketsSection list={null} providerLabel={providerLabel} />
  }

  // LIVE, as the portal reads them (`liveTicketTypeRoles`): the page shows the
  // answers the gate is deciding from right now, including a Studio edit the
  // cached conference has not seen, and the refresh after a save shows that
  // save.
  const roles = await liveTicketTypeRoles(conference)

  return (
    <WorkshopTicketsSection
      list={buildWorkshopTicketList(typeNames, roles)}
      providerLabel={providerLabel}
    />
  )
}
