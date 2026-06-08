import { useState, useCallback } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { BoardView } from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { mutationRejectionMessage } from '@/lib/trpc/errors'
import {
  canTransition,
  type SponsorState,
} from '@/lib/sponsor-crm/state-machine'

interface DragItem {
  type: 'sponsor'
  sponsor: SponsorForConferenceExpanded
  sourceColumnKey: string
}

/**
 * A drop needs a guided tier prompt when the pipeline transition the user is
 * attempting is blocked specifically by a missing tier. The decision is
 * delegated to the shared {@link canTransition} guard — the same source of truth
 * the server enforces in `moveStage` — so the UX layer can never drift from the
 * rule. The picker only resolves a tier, so it appears only when tier is the
 * blocking field; every other drop (and every other axis) proceeds directly.
 */
export function dropNeedsTier(
  view: BoardView,
  from: string,
  to: string,
  sponsor: SponsorState,
): boolean {
  if (view !== 'pipeline') return false
  const result = canTransition('pipeline', from, to, sponsor)
  return !result.ok && result.missing.some((field) => field.field === 'tier')
}

function applyOptimisticMove(
  sponsors: SponsorForConferenceExpanded[] | undefined,
  sponsorId: string,
  currentView: BoardView,
  targetColumnKey: string,
  patch?: Partial<SponsorForConferenceExpanded>,
): SponsorForConferenceExpanded[] | undefined {
  if (!sponsors) return sponsors
  return sponsors.map((s) => {
    if (s._id !== sponsorId) return s
    // `patch` carries fields the move also sets (e.g. the tier chosen in the
    // guided closed-won completion) so the optimistic cache matches what the
    // mutation persists, not just the column change.
    const base = { ...s, ...patch }
    switch (currentView) {
      case 'pipeline':
        return {
          ...base,
          status: targetColumnKey as SponsorForConferenceExpanded['status'],
        }
      case 'contract':
        return {
          ...base,
          contractStatus:
            targetColumnKey as SponsorForConferenceExpanded['contractStatus'],
        }
      case 'invoice':
        return {
          ...base,
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
      patch?: Partial<SponsorForConferenceExpanded>,
    ) => {
      // Cancel in-flight refetches so they can't clobber the optimistic write,
      // then snapshot the cache for rollback before applying the move.
      await utils.sponsor.crm.list.cancel()
      const previous = queryClient.getQueriesData<
        SponsorForConferenceExpanded[]
      >(LIST_QUERY_KEY_FILTER)
      queryClient.setQueriesData<SponsorForConferenceExpanded[]>(
        LIST_QUERY_KEY_FILTER,
        (old) =>
          applyOptimisticMove(
            old,
            sponsorId,
            currentView,
            targetColumnKey,
            patch,
          ),
      )
      // Tear down the drag overlay only once the optimistic move is in the cache,
      // so the card never flashes back in its source column.
      setActiveItem(null)

      try {
        await mutate()
      } catch (error) {
        console.error('Failed to update sponsor status:', error)
        // Roll back to the snapshot captured for THIS move. Keeping it local (not
        // a shared ref) means overlapping moves can't clobber each other's
        // rollback — a fast second drag while this mutation is still in flight.
        for (const [key, data] of previous) {
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
      }

      // Always refetch from server to ensure consistency. A board move changes
      // status/contract/invoice — the exact fields the data-health audit reads —
      // so refresh the health panel too (covers drag-to-Won and the tier picker).
      utils.sponsor.crm.list.invalidate()
      utils.sponsor.crm.healthViolations.invalidate()
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
      if (
        dropNeedsTier(currentView, sourceColumnKey, targetColumnKey, sponsor)
      ) {
        setPendingTierMove({ sponsor, targetColumnKey })
        setActiveItem(null)
        return
      }

      // runOptimisticMove clears the drag overlay once the optimistic move lands.
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

  const handleAdvanceStage = useCallback(
    async (sponsor: SponsorForConferenceExpanded, targetColumnKey: string) => {
      if (
        dropNeedsTier(currentView, sponsor.status, targetColumnKey, sponsor)
      ) {
        setPendingTierMove({ sponsor, targetColumnKey })
        return
      }

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

      await runOptimisticMove(
        sponsor._id,
        targetColumnKey,
        () =>
          update.mutateAsync({
            id: sponsor._id,
            tier: tierId,
            status: targetColumnKey as SponsorForConferenceExpanded['status'],
          }),
        // Reflect the chosen tier optimistically so the card isn't briefly shown
        // as tierless in closed-won; the refetch fills in the full tier object.
        { tier: { _id: tierId } as SponsorForConferenceExpanded['tier'] },
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
    handleAdvanceStage,
    pendingTierMove,
    confirmTierMove,
    cancelTierMove,
  }
}
