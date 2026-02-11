import { useState, useCallback, useRef } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { api } from '@/lib/trpc/client'

interface DragItem {
  type: 'sponsor'
  sponsor: SponsorForConferenceExpanded
  sourceColumnKey: string
}

type CachedQueryEntry = [QueryKey, SponsorForConferenceExpanded[] | undefined]

function applyOptimisticMove(
  sponsors: SponsorForConferenceExpanded[] | undefined,
  sponsorId: string,
  currentView: BoardView,
  targetColumnKey: string,
): SponsorForConferenceExpanded[] | undefined {
  if (!sponsors) return sponsors
  return sponsors.map((s) => {
    if (s._id !== sponsorId) return s
    switch (currentView) {
      case 'pipeline':
        return {
          ...s,
          status: targetColumnKey as SponsorForConferenceExpanded['status'],
        }
      case 'contract':
        return {
          ...s,
          contractStatus:
            targetColumnKey as SponsorForConferenceExpanded['contractStatus'],
        }
      case 'invoice':
        return {
          ...s,
          invoiceStatus:
            targetColumnKey as SponsorForConferenceExpanded['invoiceStatus'],
        }
    }
  })
}

const LIST_QUERY_KEY_FILTER = { queryKey: [['sponsor', 'crm', 'list']] }

export function useSponsorDragDrop(currentView: BoardView) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const utils = api.useUtils()
  const queryClient = useQueryClient()
  const previousDataRef = useRef<CachedQueryEntry[]>([])

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

      // Capture previous data for rollback, then optimistically update
      await utils.sponsor.crm.list.cancel()
      previousDataRef.current = queryClient.getQueriesData<
        SponsorForConferenceExpanded[]
      >(LIST_QUERY_KEY_FILTER)
      queryClient.setQueriesData<SponsorForConferenceExpanded[]>(
        LIST_QUERY_KEY_FILTER,
        (old) =>
          applyOptimisticMove(old, sponsor._id, currentView, targetColumnKey),
      )

      setActiveItem(null)

      try {
        switch (currentView) {
          case 'pipeline':
            await moveStage.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'prospect'
                | 'contacted'
                | 'negotiating'
                | 'closed-won'
                | 'closed-lost',
            })
            break
          case 'invoice':
            await updateInvoiceStatus.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'not-sent'
                | 'sent'
                | 'paid'
                | 'overdue'
                | 'cancelled',
            })
            break
          case 'contract':
            await updateContractStatus.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'none'
                | 'verbal-agreement'
                | 'contract-sent'
                | 'contract-signed',
            })
            break
        }
      } catch (error) {
        console.error('Failed to update sponsor status:', error)
        // Rollback to previous data on failure
        for (const [key, data] of previousDataRef.current) {
          queryClient.setQueryData(key, data)
        }
      } finally {
        previousDataRef.current = []
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
