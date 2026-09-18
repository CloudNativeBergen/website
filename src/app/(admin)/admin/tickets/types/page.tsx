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
import { buildClassificationContext } from '@/lib/tickets/classificationContext'
import { proposalFor } from '@/lib/tickets/discovery'
import { typeKey } from '@/lib/tickets/classification'
import { workshopAccessOf } from '@/lib/workshop/eligibility'
import type { EventTicket } from '@/lib/tickets/types'

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

  // The ROLE half of each card: what a human declared, and what the evidence
  // proposes for the types nobody declared. The tickets are what the co-holding
  // signal is read off; a failed read costs exactly that signal, so it is caught
  // rather than turned into a page-level error — the types themselves loaded.
  let eventTickets: EventTicket[] = []
  try {
    eventTickets = await access.provider.fetchEventTickets(access.eventRef)
  } catch (err) {
    console.error('Unable to read tickets for ticket-type role proposals:', err)
  }
  const classification = await buildClassificationContext(
    access,
    conference,
    eventTickets,
  )
  const declaredRole = (name: string) =>
    classification.ticketTypeRoles?.find(
      (role) => typeKey(role.typeName) === typeKey(name),
    )

  // THE WORKSHOP CLIFF, resolved server-side so the legacy list of type names
  // never reaches the browser. A conference is configured as soon as ONE type
  // declares access; until then `workshopAccessOf` answers from that list, and
  // the first declaration anywhere switches it off for every type at once —
  // which is precisely what `WorkshopAccessControl` has to warn about, by name.
  const roles = classification.ticketTypeRoles
  const workshopConfigured = (roles ?? []).some(
    (role) => role.grantsWorkshop === true,
  )
  const bridgeGranted = workshopConfigured
    ? []
    : tickets
        .map((t) => t.name)
        .filter((name) => workshopAccessOf(name, roles) === 'granted')

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
            declaredAdmits={declaredRole(ticket.name)?.admits}
            roleProposal={proposalFor(
              ticket.name,
              classification.ticketTypeProposals,
            )}
            declaredGrantsWorkshop={declaredRole(ticket.name)?.grantsWorkshop}
            workshopConfigured={workshopConfigured}
            bridgeGrantsThisType={bridgeGranted.some(
              (name) => typeKey(name) === typeKey(ticket.name),
            )}
            bridgeGrantedOtherTypes={bridgeGranted.filter(
              (name) => typeKey(name) !== typeKey(ticket.name),
            )}
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
