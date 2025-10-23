'use client'

import { useState, useMemo } from 'react'
import type { EventTicket } from '@/lib/tickets/types'
import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import { TargetConfigEditor } from './TargetConfigEditor'
import type {
  TicketAnalysisResult,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import type { FreeTicketAllocation } from '@/lib/tickets/utils'
import { createDefaultAnalysis } from '@/lib/tickets/utils'

interface TicketData {
  allTickets: EventTicket[]
  paidTickets: EventTicket[]
  freeTickets: EventTicket[]
}

interface UniqueTicketData {
  uniqueAllTickets: EventTicket[]
  uniquePaidTickets: EventTicket[]
  uniqueFreeTickets: EventTicket[]
}

interface ConferenceConfig {
  _id: string
  ticket_capacity?: number
  ticket_targets?: SalesTargetConfig
}

interface AnalysisData {
  paidAnalysis: TicketAnalysisResult | null
  allTicketsAnalysis: TicketAnalysisResult | null
}

interface TicketAnalysisClientProps {
  ticketData: TicketData
  uniqueTicketData: UniqueTicketData
  conference: ConferenceConfig
  analysisData: AnalysisData
  freeTicketAllocation: FreeTicketAllocation
  defaultTargetConfig: SalesTargetConfig
  defaultCapacity: number
}

export function TicketAnalysisClient({
  ticketData,
  uniqueTicketData,
  conference,
  analysisData,
  freeTicketAllocation,
  defaultTargetConfig,
  defaultCapacity,
}: TicketAnalysisClientProps) {
  const [includeFreeTickets, setIncludeFreeTickets] = useState(false)

  const { allTickets, paidTickets, freeTickets } = ticketData
  const { uniquePaidTickets, uniqueFreeTickets } = uniqueTicketData
  const { paidAnalysis, allTicketsAnalysis } = analysisData

  const currentData = useMemo(() => {
    const analysis = includeFreeTickets ? allTicketsAnalysis : paidAnalysis
    const tickets = includeFreeTickets ? allTickets : paidTickets
    const capacity = conference.ticket_capacity || defaultCapacity

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
    conference.ticket_capacity,
    defaultCapacity,
  ])

  return (
    <>
      <div className="mt-8">
        <TicketSalesChartDisplay
          analysis={currentData.analysis}
          paidAnalysis={
            paidAnalysis ||
            createDefaultAnalysis(
              paidTickets,
              conference.ticket_capacity || defaultCapacity,
            )
          }
          salesConfig={conference.ticket_targets || defaultTargetConfig}
          includeFreeTickets={includeFreeTickets}
          onToggleChange={setIncludeFreeTickets}
          paidCount={paidTickets.length}
          freeCount={freeTickets.length}
          uniquePaidCount={uniquePaidTickets.length}
          uniqueFreeCount={uniqueFreeTickets.length}
          freeTicketAllocation={freeTicketAllocation}
        />
      </div>

      <div className="mt-8">
        <TargetConfigEditor
          conferenceId={conference._id}
          currentConfig={conference.ticket_targets || defaultTargetConfig}
          capacity={conference.ticket_capacity || defaultCapacity}
          currentTicketsSold={currentData.tickets.length}
        />
      </div>
    </>
  )
}
