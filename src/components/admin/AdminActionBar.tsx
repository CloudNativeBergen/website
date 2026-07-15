'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckIcon,
  XMarkIcon,
  BellIcon,
  ClockIcon,
  StarIcon,
  UserPlusIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  EnvelopeIcon,
  PencilIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/20/solid'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { ProposalStatusBadge } from '@/lib/proposal/ui'
import { extractSpeakersFromProposal } from '@/lib/proposal/utils'
import { getSpeakerIndicators } from '@/lib/speaker/utils'
import { Speaker } from '@/lib/speaker/types'
import { SpeakerEmailModal } from './SpeakerEmailModal'
import { ProposalManagementModal } from './ProposalManagementModal'
import SpeakerProfilePreview from '@/components/SpeakerProfilePreview'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'

import { Conference } from '@/lib/conference/types'

interface AdminActionBarProps {
  proposal: ProposalExisting
  domain?: string
  fromEmail: string
  conference: Conference
}

export function AdminActionBar({
  proposal,
  domain,
  fromEmail,
  conference,
}: AdminActionBarProps) {
  const router = useRouter()
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [speakersWithEmail, setSpeakersWithEmail] = useState<
    {
      id: string
      name: string
      email: string
    }[]
  >([])
  const [previewSpeaker, setPreviewSpeaker] = useState<Speaker | null>(null)

  const speakers = extractSpeakersFromProposal(proposal)
  const indicators = getSpeakerIndicators(speakers)

  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  const handleEmailSpeakers = useCallback(() => {
    const speakersWithValidEmail = speakers
      .filter((speaker) => speaker.email)
      .map((speaker) => ({
        id: speaker._id,
        name: speaker.name,
        email: speaker.email,
      }))

    if (speakersWithValidEmail.length > 0) {
      setSpeakersWithEmail(speakersWithValidEmail)
      setShowEmailModal(true)
    }
  }, [speakers])

  const handleEditProposal = () => {
    setShowEditModal(true)
  }

  const handlePreviewSpeaker = useCallback(() => {
    if (speakers.length > 0) {
      const speakerForPreview = speakers[0] as Speaker
      setPreviewSpeaker(speakerForPreview)
      setShowPreviewModal(true)
    }
  }, [speakers])

  const handleProposalUpdated = () => {
    router.refresh()
    setShowEditModal(false)
  }

  const canApprove =
    proposal.status === 'submitted' || proposal.status === 'waitlisted'
  const canWaitlist = proposal.status === 'submitted'
  const canConfirm = proposal.status === 'accepted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' ||
    proposal.status === 'accepted' ||
    proposal.status === 'waitlisted'
  const canWithdraw =
    proposal.status === 'accepted' || proposal.status === 'confirmed'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
      const isCmdOrCtrl = event.metaKey || event.ctrlKey

      if (!isCmdOrCtrl) return

      // Prevent default browser behavior
      switch (event.key.toLowerCase()) {
        case 'e':
          event.preventDefault()
          handleEditProposal()
          break
        case 'p':
          event.preventDefault()
          if (speakers.length > 0) {
            handlePreviewSpeaker()
          }
          break
        case 'm':
          event.preventDefault()
          if (
            speakers.length > 0 &&
            speakers.some((speaker) => speaker.email)
          ) {
            handleEmailSpeakers()
          }
          break
        case 's':
          // Note: CMD+S will trigger save in edit modal if it's open
          // This is handled by the ProposalManagementModal component
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [speakers, handleEmailSpeakers, handlePreviewSpeaker])
  const {
    isSeasonedSpeaker,
    isNewSpeaker,
    isLocalSpeaker,
    isUnderrepresentedSpeaker,
    requiresTravelSupport,
  } = indicators

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Status:
            </span>
            <ProposalStatusBadge status={proposal.status} />
          </div>

          {proposal.reviews && proposal.reviews.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Reviews:
              </span>
              <span className="text-sm whitespace-nowrap text-gray-900 dark:text-white">
                {proposal.reviews.length} review
                {proposal.reviews.length !== 1 ? 's' : ''}
                {(() => {
                  const totalScore = proposal.reviews.reduce((sum, review) => {
                    const reviewScore =
                      (review.score.content +
                        review.score.relevance +
                        review.score.speaker) /
                      3
                    return sum + reviewScore
                  }, 0)
                  const averageScore = totalScore / proposal.reviews.length
                  return ` (${averageScore.toFixed(1)}/5)`
                })()}
              </span>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {speakers.length > 1 ? 'Speakers:' : 'Speaker:'}
              </span>
              {speakers.length > 1 && (
                <span className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                  +{speakers.length - 1} co-speaker
                  {speakers.length > 2 ? 's' : ''}
                </span>
              )}
              <div className="flex items-center gap-1">
                {isSeasonedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                    title="Seasoned speaker - has previous accepted talks"
                  >
                    <StarIcon className="h-3 w-3" />
                  </div>
                )}
                {isNewSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    title="New speaker - no previous accepted talks"
                  >
                    <UserPlusIcon className="h-3 w-3" />
                  </div>
                )}
                {isLocalSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    title="Local speaker"
                  >
                    <MapPinIcon className="h-3 w-3" />
                  </div>
                )}
                {isUnderrepresentedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                    title="Underrepresented speaker"
                  >
                    <HeartIcon className="h-3 w-3" />
                  </div>
                )}
                {requiresTravelSupport && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    title="Requires travel support"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          <AdminButton
            size="xs"
            onClick={handleEditProposal}
            title="Edit proposal (⌘E)"
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </AdminButton>

          {speakers.length > 0 && (
            <AdminButton
              color="purple"
              size="xs"
              onClick={handlePreviewSpeaker}
              title={
                speakers.length > 1
                  ? `Preview first speaker profile of ${speakers.length} speakers (⌘P)`
                  : 'Preview speaker profile (⌘P)'
              }
            >
              <EyeIcon className="h-3 w-3" />
              Preview
            </AdminButton>
          )}

          {speakers.length > 0 && speakers.some((speaker) => speaker.email) && (
            <AdminButton
              color="blue"
              size="xs"
              onClick={handleEmailSpeakers}
              title={`Email speaker (⌘M)`}
            >
              <EnvelopeIcon className="h-3 w-3" />
              Email
            </AdminButton>
          )}

          {canApprove && (
            <AdminButton
              color="green"
              size="xs"
              onClick={() => handleAction(Action.accept)}
            >
              <CheckIcon className="h-3 w-3" />
              Approve
            </AdminButton>
          )}
          {canConfirm && (
            <AdminButton
              color="green"
              size="xs"
              onClick={() => handleAction(Action.confirm)}
            >
              <CheckIcon className="h-3 w-3" />
              Confirm
            </AdminButton>
          )}
          {canWaitlist && (
            <AdminButton
              color="orange"
              size="xs"
              onClick={() => handleAction(Action.waitlist)}
            >
              <ClockIcon className="h-3 w-3" />
              Waitlist
            </AdminButton>
          )}
          {canRemind && (
            <AdminButton
              color="yellow"
              size="xs"
              onClick={() => handleAction(Action.remind)}
            >
              <BellIcon className="h-3 w-3" />
              Remind
            </AdminButton>
          )}
          {canReject && (
            <AdminButton
              color="red"
              size="xs"
              onClick={() => handleAction(Action.reject)}
            >
              <XMarkIcon className="h-3 w-3" />
              Reject
            </AdminButton>
          )}
          {canWithdraw && (
            <AdminButton
              color="red"
              size="xs"
              onClick={() => handleAction(Action.withdraw)}
            >
              <ArrowUturnLeftIcon className="h-3 w-3" />
              Withdraw
            </AdminButton>
          )}
        </div>
      </div>

      {showEmailModal && speakersWithEmail.length > 0 && (
        <SpeakerEmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false)
            setSpeakersWithEmail([])
          }}
          proposal={proposal}
          speakers={speakersWithEmail}
          domain={domain}
          fromEmail={fromEmail}
        />
      )}

      {showEditModal && (
        <ProposalManagementModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          editingProposal={proposal}
          conference={conference}
          onProposalUpdated={handleProposalUpdated}
        />
      )}

      {showPreviewModal && previewSpeaker && (
        <SpeakerProfilePreview
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false)
            setPreviewSpeaker(null)
          }}
          speaker={previewSpeaker}
          talks={[proposal]}
        />
      )}
    </div>
  )
}
