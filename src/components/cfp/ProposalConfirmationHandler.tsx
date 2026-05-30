'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ProposalActionModal } from '@/components/admin'
import { Action, Status } from '@/lib/proposal/types'
import { ConferenceWithSpeakerData } from '@/lib/dashboard/types'
import { useNotification } from '@/components/admin/NotificationProvider'

interface ProposalConfirmationHandlerProps {
  activeConferences: ConferenceWithSpeakerData[]
}

export function ProposalConfirmationHandler({
  activeConferences,
}: ProposalConfirmationHandlerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { showNotification } = useNotification()
  const [hasProcessed, setHasProcessed] = useState(false)

  const confirmId = searchParams.get('confirm')

  const cleanupUrl = useCallback(() => {
    setHasProcessed(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('confirm')
    const queryString = params.toString()
    router.replace(`/cfp/list${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    })
  }, [router, searchParams])

  // Derive proposal to confirm
  // We don't use useMemo here to satisfy React Compiler constraints for this component
  let proposalToConfirm = null
  let currentStatus = 'none'

  if (confirmId) {
    for (const conf of activeConferences) {
      const found = conf.proposals.find((p) => p._id === confirmId)
      if (found) {
        if (found.status === Status.accepted) {
          proposalToConfirm = found
          currentStatus = 'to-confirm'
        } else if (found.status === Status.confirmed) {
          proposalToConfirm = found
          currentStatus = 'already-confirmed'
        } else {
          proposalToConfirm = found
          currentStatus = 'wrong-status'
        }
        break
      }
    }
    if (!proposalToConfirm) {
      currentStatus = 'not-found'
    }
  }

  // Handle auto-notification for cases where we don't show the modal
  useEffect(() => {
    if (!confirmId || hasProcessed) return

    if (currentStatus === 'already-confirmed') {
      showNotification({
        type: 'success',
        title: 'Already Confirmed',
        message:
          'Your participation for this proposal is already confirmed. See you there!',
      })
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cleanupUrl()
    } else if (currentStatus === 'wrong-status') {
      showNotification({
        type: 'info',
        title: 'Status Update',
        message: `This proposal is currently "${proposalToConfirm?.status}". No further confirmation is required.`,
      })

      cleanupUrl()
    } else if (currentStatus === 'not-found' && activeConferences.length > 0) {
      // We only show this if conferences are actually loaded to avoid false positives
      showNotification({
        type: 'error',
        title: 'Proposal Not Found',
        message:
          'We could not find the proposal you are trying to confirm. Please check your dashboard.',
      })

      cleanupUrl()
    }
  }, [
    confirmId,
    currentStatus,
    activeConferences.length,
    hasProcessed,
    proposalToConfirm?.status,
    showNotification,
    cleanupUrl,
  ])

  const handleClose = () => {
    cleanupUrl()
  }

  const handleAction = () => {
    showNotification({
      type: 'success',
      title: 'Participation Confirmed',
      message:
        'Thank you for confirming your participation! We look forward to seeing you.',
    })
    router.refresh()
    cleanupUrl()
  }

  if (currentStatus !== 'to-confirm' || !proposalToConfirm || hasProcessed)
    return null

  return (
    <ProposalActionModal
      open={true}
      close={handleClose}
      proposal={proposalToConfirm}
      action={Action.confirm}
      onAction={handleAction}
    />
  )
}
