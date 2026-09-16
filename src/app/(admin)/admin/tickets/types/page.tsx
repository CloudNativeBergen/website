import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { type PublicTicketType } from '@/lib/tickets/public'
import { TicketTypeCard } from './TicketTypeCard'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
} from '@/lib/tickets/admin-access'
import {
  ErrorDisplay,
  AdminPageHeader,
  TicketingStateNotice,
} from '@/components/admin'
import { TicketIcon } from '@heroicons/react/24/outline'
import { EmptyState } from '@/components/EmptyState'

export default async function TicketTypesAdminPage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={`Failed to load conference data: ${conferenceError.message}`}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  // Provider-aware: the resolver reads whichever binding this conference's
  // vendor uses, so a Tito-bound conference lists ITS ticket types instead of
  // being refused for missing Checkin ids. It also replaces the silent empty
  // render that a credential-less org used to get — an unresolvable provider is
  // not "this event has no ticket types".
  const access = await resolveTicketingAdminAccess(conference)
  const providerLabel = ticketingProviderLabel(access.providerType)

  if (access.state !== 'ready') {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<TicketIcon />}
          title="Ticket Types"
          description="Ticket types for"
          contextHighlight={conference.title}
          backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        />
        <TicketingStateNotice
          state={access.state}
          providerLabel={providerLabel}
          surface="ticket types"
        />
      </div>
    )
  }

  let tickets: PublicTicketType[] = []
  let error: string | null = null

  try {
    // The provider-shaped eventRef (not a bare Checkin event id), so Tito routes
    // to its account/event slugs.
    const data = await access.provider.fetchPublicTicketTypes(access.eventRef)
    tickets = data.tickets.sort((a, b) => a.position - b.position)
  } catch (err) {
    error = (err as Error).message
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to Load Ticket Types"
        message={error}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<TicketIcon />}
        title="Ticket Types"
        description={`All ticket types configured in ${providerLabel} for`}
        contextHighlight={conference.title}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
      />

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <TicketTypeCard
            key={ticket.id}
            ticket={ticket}
            publicFreeTicketIds={conference.publicFreeTicketIds ?? []}
          />
        ))}

        {tickets.length === 0 && (
          <EmptyState
            icon={TicketIcon}
            title="No ticket types found"
            description={`No ticket types are configured in ${providerLabel} for this event.`}
            className="rounded-lg bg-white p-12 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
          />
        )}
      </div>
    </div>
  )
}
