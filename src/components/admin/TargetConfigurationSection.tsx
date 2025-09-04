'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TargetConfigurationEditor } from './TargetConfigurationEditor'
import type {
  ConferenceWithTargets,
  TicketTargetAnalysis,
} from '@/lib/tickets/targets'
import { api } from '@/lib/trpc/client'

interface TargetConfigurationSectionProps {
  conference: ConferenceWithTargets
  targetAnalysis: TicketTargetAnalysis
  onPreviewChange?: (previewAnalysis: TicketTargetAnalysis | null) => void
  onComplete?: () => void // Callback when editing is complete
}

/**
 * Client component for managing target configuration editing
 * Only shows editor mode - no read-only view
 */
export function TargetConfigurationSection({
  conference,
  targetAnalysis,
  onPreviewChange,
  onComplete,
}: TargetConfigurationSectionProps) {
  const router = useRouter()
  const utils = api.useUtils()

  const updateSettingsMutation = api.tickets.updateSettings.useMutation({
    onSuccess: () => {
      // Use proper cache invalidation and refresh server components
      utils.invalidate()
      router.refresh()

      // Always call onComplete to hide this component
      onComplete?.()
    },
    onError: (error) => {
      console.error('Failed to update target configuration:', error)
    },
  })

  const handleUpdate = async (updates: Partial<ConferenceWithTargets>) => {
    if (!updates.ticket_targets || !updates.ticket_capacity) return

    updateSettingsMutation.mutate({
      conferenceId: conference._id,
      ticket_capacity: updates.ticket_capacity,
      ticket_targets: updates.ticket_targets,
    })
  }

  const handleCancel = () => {
    onComplete?.()
  }

  const handlePreviewChange = useCallback(
    (previewAnalysis: TicketTargetAnalysis | null) => {
      onPreviewChange?.(previewAnalysis)
    },
    [onPreviewChange],
  )

  return (
    <div className="mt-4">
      <TargetConfigurationEditor
        conference={conference}
        onUpdate={handleUpdate}
        isUpdating={updateSettingsMutation.isPending}
        onCancel={handleCancel}
        onPreviewChange={handlePreviewChange}
        baseAnalysis={targetAnalysis}
      />
    </div>
  )
}
