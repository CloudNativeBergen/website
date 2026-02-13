'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckIcon,
  XMarkIcon,
  BellIcon,
  StarIcon,
  UserPlusIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  EnvelopeIcon,
  PencilIcon,
  EyeIcon,
} from '@heroicons/react/20/solid'
import { ProposalExisting, Action } from '@/lib/proposal/types'
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

  const canApprove = proposal.status === 'submitted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' || proposal.status === 'accepted'

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Status:
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                proposal.status === 'accepted'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : proposal.status === 'rejected'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    : proposal.status === 'submitted'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {proposal.status.charAt(0).toUpperCase() +
                proposal.status.slice(1)}
            </span>
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
                Speaker:
              </span>
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

        <div className="flex shrink-0 items-center gap-2">
          <AdminButton
            size="xs"
            onClick={handleEditProposal}
            title="Edit proposal"
          >
            <PencilIcon className="h-3 w-3" />
            <span>Edit</span>
            <kbd className="ml-1 hidden rounded border border-indigo-400 bg-indigo-500 px-1.5 py-0.5 text-xs font-semibold text-white sm:inline dark:border-indigo-600 dark:bg-indigo-700">
              ⌘E
            </kbd>
          </AdminButton>

          {speakers.length > 0 && (
            <AdminButton
              color="purple"
              size="xs"
              onClick={handlePreviewSpeaker}
              title="Preview speaker profile"
            >
              <EyeIcon className="h-3 w-3" />
              <span>Preview</span>
              <kbd className="ml-1 hidden rounded border border-purple-400 bg-purple-500 px-1.5 py-0.5 text-xs font-semibold text-white sm:inline dark:border-purple-600 dark:bg-purple-700">
                ⌘P
              </kbd>
            </AdminButton>
          )}

          {speakers.length > 0 && speakers.some((speaker) => speaker.email) && (
            <AdminButton
              color="blue"
              size="xs"
              onClick={handleEmailSpeakers}
              title={`Email ${speakers.length === 1 ? speakers.filter((s) => s.email)[0]?.name : `${speakers.filter((s) => s.email).length} speakers`}`}
            >
              <EnvelopeIcon className="h-3 w-3" />
              <span>Email</span>
              <kbd className="ml-1 hidden rounded border border-blue-400 bg-blue-500 px-1.5 py-0.5 text-xs font-semibold text-white sm:inline dark:border-blue-600 dark:bg-blue-700">
                ⌘M
              </kbd>
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
