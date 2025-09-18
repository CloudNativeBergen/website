'use client'

import { useState } from 'react'
import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import { TicketSalesChartConfig } from './TargetConfigurationSection'
import type {
  ConferenceWithTargets,
  TicketTargetAnalysis,
} from '@/lib/tickets/types'

interface TicketSalesChartProps {
  conference: ConferenceWithTargets
  targetAnalysis: TicketTargetAnalysis
}

/**
 * Client wrapper component that manages chart preview state
 */
export function TicketSalesChart({
  conference,
  targetAnalysis,
}: TicketSalesChartProps) {
  const [previewAnalysis, setPreviewAnalysis] =
    useState<TicketTargetAnalysis | null>(null)

  // Use preview analysis when available, otherwise use real analysis
  const displayAnalysis = previewAnalysis || targetAnalysis

  const handleConfigurationComplete = () => {
    // Return to summary view after saving
    setPreviewAnalysis(null)
  }

  return (
    <>
      {/* Ticket Target Tracking Chart */}
      <div className="mt-8">
        <TicketSalesChartDisplay
          analysis={displayAnalysis}
          conference={conference}
        />
      </div>

      {/* Target Configuration Section */}
      <TicketSalesChartConfig
        conference={conference}
        targetAnalysis={targetAnalysis}
        onPreviewChange={setPreviewAnalysis}
        onComplete={handleConfigurationComplete}
      />
    </>
  )
}
