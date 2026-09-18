import { TicketIcon } from '@heroicons/react/24/outline'
import { formatDateTimeSafe } from '@/lib/time'
import {
  getTicketSaleStatus,
  formatTicketPrice,
  isPublicFreeTicketType,
  stripHtml,
  type PublicTicketType,
} from '@/lib/tickets/public'
import { PublicFreeTicketToggle } from '@/components/admin/PublicFreeTicketToggle'
import {
  StatusBadge as SharedStatusBadge,
  type BadgeColor,
} from '@/components/StatusBadge'
import { TicketTypeRoleControl } from './TicketTypeRoleControl'
import { WorkshopAccessControl } from './WorkshopAccessControl'
import type { TicketTypeProposal } from '@/lib/tickets/discovery'

function StatusBadge({
  status,
}: {
  status: 'expired' | 'active' | 'upcoming'
}) {
  const config: Record<
    'expired' | 'active' | 'upcoming',
    { label: string; color: BadgeColor }
  > = {
    active: { label: 'Active', color: 'green' },
    expired: { label: 'Expired', color: 'gray' },
    upcoming: { label: 'Upcoming', color: 'yellow' },
  }
  const { label, color } = config[status]
  return <SharedStatusBadge label={label} color={color} />
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return formatDateTimeSafe(dateStr)
}

/**
 * One ticket type on /admin/tickets/types: name, status, pricing, availability,
 * the visibility window and — for public free types — the #860 opt-in.
 *
 * Its own component so the phone layout is inspectable in Storybook; the page
 * that renders it is a server component with a provider fetch behind it.
 */
export function TicketTypeCard({
  ticket,
  publicFreeTicketIds,
  declaredAdmits,
  roleProposal,
  declaredGrantsWorkshop,
  workshopConfigured = false,
  bridgeGrantsThisType = false,
  bridgeGrantedOtherTypes = [],
}: {
  ticket: PublicTicketType
  publicFreeTicketIds: number[]
  /** `conference.ticketTypeRoles` for this type, when a human declared one. */
  declaredAdmits?: boolean
  /** What `@/lib/tickets/discovery` proposed for it, if anything. */
  roleProposal?: TicketTypeProposal
  /** `grantsWorkshop` for this type, when a human declared one. */
  declaredGrantsWorkshop?: boolean
  /** Has ANY type at this conference declared workshop access? */
  workshopConfigured?: boolean
  /** On the bridge: does the historical list grant THIS type access? */
  bridgeGrantsThisType?: boolean
  /** On the bridge: the other types it grants — see {@link WorkshopAccessControl}. */
  bridgeGrantedOtherTypes?: readonly string[]
}) {
  const status = getTicketSaleStatus(ticket)
  const currency = ticket.price[0]?.key?.toUpperCase() || 'NOK'

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <TicketIcon className="h-5 w-5 shrink-0 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {ticket.name}
          </h3>
          <StatusBadge status={status} />
          {ticket.requiresInvitation && (
            <SharedStatusBadge label="Invite-only" color="purple" />
          )}
        </div>
        <div className="text-sm text-gray-500 sm:text-right dark:text-gray-400">
          ID: {ticket.id} &middot; Position: {ticket.position}
        </div>
      </div>

      {ticket.description && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {stripHtml(ticket.description)}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pricing */}
        <div>
          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Pricing
          </dt>
          <dd className="mt-1">
            {ticket.price.length > 0 ? (
              <div className="space-y-2">
                {ticket.price.map((p, i) => {
                  const excl = formatTicketPrice(p.price, p.vat)
                  const incl = formatTicketPrice(p.price, p.vat, {
                    includeVat: true,
                  })
                  return (
                    <div key={i} className="text-sm">
                      {/* Price and VAT stay on one line; the description gets
                          its own, so a phone does not have to read one long
                          wrapped sentence. */}
                      <div>
                        <span className="font-medium whitespace-nowrap text-gray-900 dark:text-white">
                          {currency} {excl}
                        </span>{' '}
                        <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">
                          ({incl} incl. {p.vat}% VAT)
                        </span>
                      </div>
                      {p.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {p.description}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="text-sm text-gray-400">No pricing set</span>
            )}
          </dd>
        </div>

        {/* Availability */}
        <div>
          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Availability
          </dt>
          <dd className="mt-1 text-sm text-gray-900 dark:text-white">
            {/* `available: null` is UNKNOWN, not unlimited — the same rule
                `getTicketAvailability` states: Checkin passes the vendor's
                field through raw and it is frequently null. Rendering that as
                "Unlimited" told an organizer a capped type had no cap, and a
                capped type can then be oversold. */}
            {ticket.available !== null ? (
              <span>
                {ticket.available}{' '}
                <span className="text-gray-500 dark:text-gray-400">
                  remaining
                </span>
              </span>
            ) : (
              <span
                className="text-gray-400"
                title="The ticket vendor reports no remaining count for this type. Any cap it has is set in the vendor's own system."
              >
                Not reported
              </span>
            )}
          </dd>
        </div>

        {/* Visibility Window */}
        <div>
          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Visible From
          </dt>
          <dd className="mt-1 text-sm text-gray-900 dark:text-white">
            {formatDate(ticket.visibleStartsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Visible Until
          </dt>
          <dd className="mt-1 text-sm text-gray-900 dark:text-white">
            {formatDate(ticket.visibleEndsAt)}
          </dd>
        </div>
      </div>

      {/* Type + public free-tier opt-in (#860). The toggle appears only on
          types the opt-in can actually publish — the same predicate
          `resolveDisplayTickets` filters on — so admin and policy agree on
          what "free" means. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Type: <span className="font-mono">{ticket.type}</span>
        </span>
        {isPublicFreeTicketType(ticket) && (
          <PublicFreeTicketToggle
            ticketId={ticket.id}
            ticketName={ticket.name}
            initialVisible={publicFreeTicketIds.includes(ticket.id)}
          />
        )}
      </div>

      {/* Does this type seat a human? Nothing the vendor sends answers it, and
          it is what the participant count on /admin/tickets is built from. */}
      <TicketTypeRoleControl
        typeName={ticket.name}
        declaredAdmits={declaredAdmits}
        proposal={roleProposal}
      />

      {/* Does this type let its holder into the workshops? Access control, not
          a count — and until some type declares it, the answer comes from a
          hardcoded list of another conference's type names. */}
      <WorkshopAccessControl
        typeName={ticket.name}
        declaredGrantsWorkshop={declaredGrantsWorkshop}
        workshopConfigured={workshopConfigured}
        bridgeGrantsThisType={bridgeGrantsThisType}
        bridgeGrantedOtherTypes={bridgeGrantedOtherTypes}
      />
    </div>
  )
}
