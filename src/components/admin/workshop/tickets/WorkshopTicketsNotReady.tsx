import {
  TicketingStateNotice,
  type TicketingNoticeState,
} from '@/components/admin/TicketingStateNotice'
import { WORKSHOP_TICKETS_ANCHOR } from './anchor'

/**
 * The section when ticketing itself is not ready: no event bound yet, not
 * available to the organization, or switched off by an operator. It says what
 * `/admin/tickets/types` says for the same state (`TicketingStateNotice`), and
 * offers no switch. It keeps the anchor that page links to.
 *
 * NOT the unreadable state: nothing failed, and reloading changes nothing.
 */
export function WorkshopTicketsNotReady({
  state,
  providerLabel,
}: {
  state: Exclude<TicketingNoticeState, 'unsupported'>
  providerLabel: string
}) {
  return (
    <section
      id={WORKSHOP_TICKETS_ANCHOR}
      aria-label="Workshop tickets"
      className="scroll-mt-24"
    >
      <TicketingStateNotice
        state={state}
        providerLabel={providerLabel}
        surface="workshop tickets"
      />
    </section>
  )
}
