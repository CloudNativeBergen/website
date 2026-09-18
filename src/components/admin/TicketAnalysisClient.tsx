'use client'

import { useState, useMemo, type ReactNode } from 'react'
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

/**
 * COUNTS, NOT TICKETS. This component only ever read `.length` off the three
 * arrays it used to receive, and the zeroed stand-in below needs no rows — so
 * the whole event's `EventTicket` records (names, addresses, order ids, sums,
 * payment state) no longer cross into the client bundle to be counted.
 */
interface TicketCounts {
  all: number
  paid: number
  free: number
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
  ticketCounts: TicketCounts
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
  ticketCounts,
  participantTally,
  conference,
  analysisData,
  freeTicketAllocation,
  defaultTargetConfig,
  amountsIncludeVat,
  chartFallback,
}: TicketAnalysisClientProps) {
  const [includeFreeTickets, setIncludeFreeTickets] = useState(false)

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
    const count = includeFreeTickets ? ticketCounts.all : ticketCounts.paid
    // Unset capacity stays 0 — never an invented default. See `tickets/config`.
    const capacity = conference.ticketCapacity ?? 0

    // `empty` only — a genuine no-tickets zero, and an empty outcome is
    // precisely the case with no rows to total, so the stand-in is built from
    // none. An `unavailable` outcome is never rendered from here; it replaces
    // this whole block with a failure.
    return {
      analysis:
        outcome.status === 'ok'
          ? outcome.analysis
          : createDefaultAnalysis([], capacity),
      count,
    }
  }, [
    includeFreeTickets,
    allTicketsAnalysis,
    paidAnalysis,
    ticketCounts,
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
                : createDefaultAnalysis([], conference.ticketCapacity ?? 0)
            }
            salesConfig={conference.ticketTargets || defaultTargetConfig}
            includeFreeTickets={includeFreeTickets}
            onToggleChange={setIncludeFreeTickets}
            paidCount={ticketCounts.paid}
            freeCount={ticketCounts.free}
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
          currentTicketsSold={currentData.count}
        />
      </div>
    </>
  )
}
