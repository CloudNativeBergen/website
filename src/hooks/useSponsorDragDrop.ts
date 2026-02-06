import { useState, useCallback } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { api } from '@/lib/trpc/client'
import { useQueryClient } from '@tanstack/react-query'

interface DragItem {
  type: 'sponsor'
  sponsor: SponsorForConferenceExpanded
  sourceColumnKey: string
}

// Applies an optimistic status change to cached sponsor list data
function applyOptimisticMove(
  sponsors: SponsorForConferenceExpanded[] | undefined,
  sponsorId: string,
  currentView: BoardView,
  targetColumnKey: string,
): SponsorForConferenceExpanded[] | undefined {
  if (!sponsors) return sponsors
  return sponsors.map((s) => {
    if (s._id !== sponsorId) return s
    if (currentView === 'pipeline') {
      return {
        ...s,
        status: targetColumnKey as SponsorForConferenceExpanded['status'],
      }
    } else if (currentView === 'contract') {
      return {
        ...s,
        contract_status:
          targetColumnKey as SponsorForConferenceExpanded['contract_status'],
      }
    } else {
      return {
        ...s,
        invoice_status:
          targetColumnKey as SponsorForConferenceExpanded['invoice_status'],
      }
    }
  })
}

export function useSponsorDragDrop(currentView: BoardView) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const utils = api.useUtils()
  const queryClient = useQueryClient()

  const moveStage = api.sponsor.crm.moveStage.useMutation()
  const updateInvoiceStatus = api.sponsor.crm.updateInvoiceStatus.useMutation()
  const updateContractStatus =
    api.sponsor.crm.updateContractStatus.useMutation()

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const dragData = active.data.current as DragItem
    setActiveItem(dragData)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (!over || !active.data.current) {
        setActiveItem(null)
        return
      }

      const dragItem = active.data.current as DragItem
      const dropData = over.data.current as {
        type: 'column'
        columnKey: string
      }

      if (dropData?.type !== 'column') {
        setActiveItem(null)
        return
      }

      const { sponsor, sourceColumnKey } = dragItem
      const targetColumnKey = dropData.columnKey

      if (sourceColumnKey === targetColumnKey) {
        setActiveItem(null)
        return
      }

      // Optimistic update: move the card immediately in the cache
      await utils.sponsor.crm.list.cancel()
      queryClient.setQueriesData<SponsorForConferenceExpanded[]>(
        { queryKey: [['sponsor', 'crm', 'list']] },
        (old) =>
          applyOptimisticMove(old, sponsor._id, currentView, targetColumnKey),
      )

      setActiveItem(null)

      try {
        if (currentView === 'pipeline') {
          await moveStage.mutateAsync({
            id: sponsor._id,
            newStatus: targetColumnKey as
              | 'prospect'
              | 'contacted'
              | 'negotiating'
              | 'closed-won'
              | 'closed-lost',
          })
        } else if (currentView === 'invoice') {
          await updateInvoiceStatus.mutateAsync({
            id: sponsor._id,
            newStatus: targetColumnKey as
              | 'not-sent'
              | 'sent'
              | 'paid'
              | 'overdue'
              | 'cancelled',
          })
        } else if (currentView === 'contract') {
          await updateContractStatus.mutateAsync({
            id: sponsor._id,
            newStatus: targetColumnKey as
              | 'none'
              | 'verbal-agreement'
              | 'contract-sent'
              | 'contract-signed',
          })
        }
      } catch (error) {
        console.error('Failed to update sponsor status:', error)
      }

      // Always refetch from server to ensure consistency
      utils.sponsor.crm.list.invalidate()
    },
    [
      currentView,
      moveStage,
      updateInvoiceStatus,
      updateContractStatus,
      utils,
      queryClient,
    ],
  )

  return {
    activeItem,
    isDragging: activeItem !== null,
    handleDragStart,
    handleDragEnd,
  }
}
