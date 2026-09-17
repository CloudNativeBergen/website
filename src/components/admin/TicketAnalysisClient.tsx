'use client'

import { useState, useMemo, type ReactNode } from 'react'
import type { EventTicket } from '@/lib/tickets/types'
import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import { TargetConfigEditor } from './TargetConfigEditor'
import type {
  TicketAnalysisResult,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import type { FreeTicketAllocation } from '@/lib/tickets/utils'
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
  paidAnalysis: TicketAnalysisResult | null
  allTicketsAnalysis: TicketAnalysisResult | null
}

interface TicketAnalysisClientProps {
  ticketData: TicketData
  participantTally: ParticipantTally
  conference: ConferenceConfig
  analysisData: AnalysisData
  freeTicketAllocation: FreeTicketAllocation
  defaultTargetConfig: SalesTargetConfig
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
  chartFallback,
}: TicketAnalysisClientProps) {
  const [includeFreeTickets, setIncludeFreeTickets] = useState(false)

  const { allTickets, paidTickets, freeTickets } = ticketData
  const { paidAnalysis, allTicketsAnalysis } = analysisData

  const currentData = useMemo(() => {
    const analysis = includeFreeTickets ? allTicketsAnalysis : paidAnalysis
    const tickets = includeFreeTickets ? allTickets : paidTickets
    // Unset capacity stays 0 — never an invented default. See `tickets/config`.
    const capacity = conference.ticketCapacity ?? 0

    return {
      analysis: analysis || createDefaultAnalysis(tickets, capacity),
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
        <TicketSalesChartDisplay
          analysis={currentData.analysis}
          paidAnalysis={
            paidAnalysis ||
            createDefaultAnalysis(paidTickets, conference.ticketCapacity ?? 0)
          }
          salesConfig={conference.ticketTargets || defaultTargetConfig}
          includeFreeTickets={includeFreeTickets}
          onToggleChange={setIncludeFreeTickets}
          paidCount={paidTickets.length}
          freeCount={freeTickets.length}
          participantTally={participantTally}
          freeTicketAllocation={freeTicketAllocation}
          chartFallback={chartFallback}
        />
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
