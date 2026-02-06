import { useState, useCallback } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { api } from '@/lib/trpc/client'

interface DragItem {
  type: 'sponsor'
  sponsor: SponsorForConferenceExpanded
  sourceColumnKey: string
}

export function useSponsorDragDrop(currentView: BoardView) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const utils = api.useUtils()

  const moveStage = api.sponsor.crm.moveStage.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
    },
  })

  const updateInvoiceStatus = api.sponsor.crm.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
    },
  })

  const updateContractStatus = api.sponsor.crm.updateContractStatus.useMutation(
    {
      onSuccess: () => {
        utils.sponsor.crm.list.invalidate()
      },
    },
  )

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

      // Don't do anything if dropped in the same column
      if (sourceColumnKey === targetColumnKey) {
        setActiveItem(null)
        return
      }

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

      setActiveItem(null)
    },
    [currentView, moveStage, updateInvoiceStatus, updateContractStatus],
  )

  return {
    activeItem,
    isDragging: activeItem !== null,
    handleDragStart,
    handleDragEnd,
  }
}
