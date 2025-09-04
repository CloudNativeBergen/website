'use client'

import { useState } from 'react'
import { TicketTargetChartEnhanced } from './TicketTargetChartEnhanced'
import { TargetConfigurationSection } from './TargetConfigurationSection'
import type {
  ConferenceWithTargets,
  TicketTargetAnalysis,
} from '@/lib/tickets/targets'

interface TargetTrackingWithPreviewProps {
  conference: ConferenceWithTargets
  targetAnalysis: TicketTargetAnalysis
}

/**
 * Client wrapper component that manages chart preview state
 */
export function TargetTrackingWithPreview({
  conference,
  targetAnalysis,
}: TargetTrackingWithPreviewProps) {
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
        <TicketTargetChartEnhanced
          analysis={displayAnalysis}
          conference={conference}
        />
      </div>

      {/* Target Configuration Section */}
      <TargetConfigurationSection
        conference={conference}
        targetAnalysis={targetAnalysis}
        onPreviewChange={setPreviewAnalysis}
        onComplete={handleConfigurationComplete}
      />
    </>
  )
}
