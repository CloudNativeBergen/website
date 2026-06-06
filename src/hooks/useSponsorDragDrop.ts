import { useState, useCallback, useRef } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { mutationRejectionMessage } from '@/lib/trpc/errors'

interface DragItem {
  type: 'sponsor'
  sponsor: SponsorForConferenceExpanded
  sourceColumnKey: string
}

type CachedQueryEntry = [QueryKey, SponsorForConferenceExpanded[] | undefined]

/**
 * A drop needs a guided tier prompt when it would move a sponsor to the
 * pipeline's `closed-won` column without a tier set — the one transition the
 * server guard blocks for lack of a tier. Every other drop proceeds directly.
 */
export function dropNeedsTier(
  view: BoardView,
  targetColumnKey: string,
  sponsor: { tier?: unknown },
): boolean {
  return view === 'pipeline' && targetColumnKey === 'closed-won' && !sponsor.tier
}

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

interface PendingTierMove {
  sponsor: SponsorForConferenceExpanded
  targetColumnKey: string
}

export function useSponsorDragDrop(currentView: BoardView) {
  const [activeItem, setActiveItem] = useState<DragItem | null>(null)
  const [pendingTierMove, setPendingTierMove] =
    useState<PendingTierMove | null>(null)
  const utils = api.useUtils()
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()
  const previousDataRef = useRef<CachedQueryEntry[]>([])

  const moveStage = api.sponsor.crm.moveStage.useMutation()
  const update = api.sponsor.crm.update.useMutation()
  const updateInvoiceStatus = api.sponsor.crm.updateInvoiceStatus.useMutation()
  const updateContractStatus =
    api.sponsor.crm.updateContractStatus.useMutation()

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const dragData = active.data.current as DragItem
    setActiveItem(dragData)
  }, [])

  // Optimistically move a card, run the backing mutation, and on failure roll
  // the cache back and surface why. Shared by direct drags and the guided
  // tier-completion so both stay consistent.
  const runOptimisticMove = useCallback(
    async (
      sponsorId: string,
      targetColumnKey: string,
      mutate: () => Promise<unknown>,
    ) => {
      await utils.sponsor.crm.list.cancel()
      previousDataRef.current = queryClient.getQueriesData<
        SponsorForConferenceExpanded[]
      >(LIST_QUERY_KEY_FILTER)
      queryClient.setQueriesData<SponsorForConferenceExpanded[]>(
        LIST_QUERY_KEY_FILTER,
        (old) =>
          applyOptimisticMove(old, sponsorId, currentView, targetColumnKey),
      )

      try {
        await mutate()
      } catch (error) {
        console.error('Failed to update sponsor status:', error)
        // Rollback to previous data on failure
        for (const [key, data] of previousDataRef.current) {
          queryClient.setQueryData(key, data)
        }
        // Surface why the move was rejected: the server's actionable message for
        // a guard rejection, a generic fallback for transient/internal errors.
        showNotification({
          type: 'error',
          title: 'Could not move sponsor',
          message: mutationRejectionMessage(
            error,
            'Failed to update sponsor status. Please try again.',
          ),
        })
      } finally {
        previousDataRef.current = []
      }

      // Always refetch from server to ensure consistency
      utils.sponsor.crm.list.invalidate()
    },
    [currentView, utils, queryClient, showNotification],
  )

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

      // Guided completion: a tierless move to closed-won would be rejected by
      // the server guard. Instead of letting it fail and bounce back, hold the
      // move and ask for a tier — confirmTierMove finishes it in one step.
      if (dropNeedsTier(currentView, targetColumnKey, sponsor)) {
        setPendingTierMove({ sponsor, targetColumnKey })
        setActiveItem(null)
        return
      }

      setActiveItem(null)

      await runOptimisticMove(sponsor._id, targetColumnKey, () => {
        switch (currentView) {
          case 'pipeline':
            return moveStage.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'prospect'
                | 'contacted'
                | 'negotiating'
                | 'closed-won'
                | 'closed-lost',
            })
          case 'invoice':
            return updateInvoiceStatus.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'not-sent'
                | 'sent'
                | 'paid'
                | 'overdue'
                | 'cancelled',
            })
          case 'contract':
            return updateContractStatus.mutateAsync({
              id: sponsor._id,
              newStatus: targetColumnKey as
                | 'none'
                | 'verbal-agreement'
                | 'contract-sent'
                | 'contract-signed',
            })
          default:
            return Promise.resolve()
        }
      })
    },
    [
      currentView,
      runOptimisticMove,
      moveStage,
      updateInvoiceStatus,
      updateContractStatus,
    ],
  )

  // Finish a held closed-won move with the chosen tier. Sets tier + status in a
  // single atomic update so the server guard is satisfied and there is no
  // half-done state (tier set but still not won).
  const confirmTierMove = useCallback(
    async (tierId: string) => {
      if (!pendingTierMove) return
      const { sponsor, targetColumnKey } = pendingTierMove
      setPendingTierMove(null)

      await runOptimisticMove(sponsor._id, targetColumnKey, () =>
        update.mutateAsync({
          id: sponsor._id,
          tier: tierId,
          status: targetColumnKey as SponsorForConferenceExpanded['status'],
        }),
      )
    },
    [pendingTierMove, update, runOptimisticMove],
  )

  // Abort a held move: nothing was optimistically applied, so the sponsor stays
  // exactly where it started.
  const cancelTierMove = useCallback(() => {
    setPendingTierMove(null)
  }, [])

  return {
    activeItem,
    isDragging: activeItem !== null,
    handleDragStart,
    handleDragEnd,
    pendingTierMove,
    confirmTierMove,
    cancelTierMove,
  }
}
