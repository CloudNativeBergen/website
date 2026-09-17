'use client'

import { useState, useMemo, type ReactNode } from 'react'
import type { EventTicket } from '@/lib/tickets/types'
import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import { TargetConfigEditor } from './TargetConfigEditor'
import type {
  TicketAnalysisOutcome,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import { AnalysisUnavailable } from './AnalysisUnavailable'
import type { FreeTicketAllocation } from '@/lib/tickets/freeAllocation'
import type { ParticipantTally } from '@/lib/tickets/participants'
import { createDefaultAnalysis } from '@/lib/tickets/utils'

interface TicketData {
  allTickets: EventTicket[]
  paidTickets: EventTicket[]
  freeTickets: EventTicket[]
}

interface ConferenceConfig {
  _id: string
  ticketCapacity?: number
  ticketTargets?: SalesTargetConfig
}

interface AnalysisData {
  paidAnalysis: TicketAnalysisOutcome
  allTicketsAnalysis: TicketAnalysisOutcome
}

interface TicketAnalysisClientProps {
  ticketData: TicketData
  participantTally: ParticipantTally
  conference: ConferenceConfig
  analysisData: AnalysisData
  freeTicketAllocation: FreeTicketAllocation
  defaultTargetConfig: SalesTargetConfig
  /** Provider VAT basis for the Revenue card — see `TicketSalesChartDisplay`. */
  amountsIncludeVat?: boolean
  /** Replaces the chart below `sm` — see `TicketSalesChartDisplay`. */
  chartFallback?: ReactNode
}

export function TicketAnalysisClient({
  ticketData,
  participantTally,
  conference,
  analysisData,
  freeTicketAllocation,
  defaultTargetConfig,
  amountsIncludeVat,
  chartFallback,
}: TicketAnalysisClientProps) {
  const [includeFreeTickets, setIncludeFreeTickets] = useState(false)

  const { allTickets, paidTickets, freeTickets } = ticketData
  const { paidAnalysis, allTicketsAnalysis } = analysisData

  // A failure in EITHER analysis invalidates this block: the cards read off the
  // paid analysis and the chart off whichever the toggle selects, so a failure
  // in one would otherwise be hidden behind the other's numbers.
  const failure =
    paidAnalysis.status === 'unavailable'
      ? paidAnalysis.error
      : allTicketsAnalysis.status === 'unavailable'
        ? allTicketsAnalysis.error
        : null

  const currentData = useMemo(() => {
    const outcome = includeFreeTickets ? allTicketsAnalysis : paidAnalysis
    const tickets = includeFreeTickets ? allTickets : paidTickets
    // Unset capacity stays 0 — never an invented default. See `tickets/config`.
    const capacity = conference.ticketCapacity ?? 0

    // `empty` only — a genuine no-tickets zero. An `unavailable` outcome is
    // never rendered from here; it replaces this whole block with a failure.
    return {
      analysis:
        outcome.status === 'ok'
          ? outcome.analysis
          : createDefaultAnalysis(tickets, capacity),
      tickets,
    }
  }, [
    includeFreeTickets,
    allTicketsAnalysis,
    paidAnalysis,
    allTickets,
    paidTickets,
    conference.ticketCapacity,
  ])

  return (
    <>
      <div className="mt-8">
        {failure ? (
          <AnalysisUnavailable error={failure} />
        ) : (
          <TicketSalesChartDisplay
            analysis={currentData.analysis}
            paidAnalysis={
              paidAnalysis.status === 'ok'
                ? paidAnalysis.analysis
                : createDefaultAnalysis(
                    paidTickets,
                    conference.ticketCapacity ?? 0,
                  )
            }
            salesConfig={conference.ticketTargets || defaultTargetConfig}
            includeFreeTickets={includeFreeTickets}
            onToggleChange={setIncludeFreeTickets}
            paidCount={paidTickets.length}
            freeCount={freeTickets.length}
            participantTally={participantTally}
            freeTicketAllocation={freeTicketAllocation}
            amountsIncludeVat={amountsIncludeVat}
            chartFallback={chartFallback}
          />
        )}
      </div>

      <div className="mt-8">
        <TargetConfigEditor
          currentConfig={conference.ticketTargets || defaultTargetConfig}
          capacity={conference.ticketCapacity ?? 0}
          currentTicketsSold={currentData.tickets.length}
        />
      </div>
    </>
  )
}
