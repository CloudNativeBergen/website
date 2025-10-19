'use client'

import { useState } from 'react'
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

  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  const handleEmailSpeakers = () => {
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
  }

  const handleEditProposal = () => {
    setShowEditModal(true)
  }

  const handlePreviewSpeaker = () => {
    if (speakers.length > 0) {
      const speakerForPreview = speakers[0] as Speaker
      setPreviewSpeaker(speakerForPreview)
      setShowPreviewModal(true)
    }
  }

  const handleProposalUpdated = () => {
    router.refresh()
    setShowEditModal(false)
  }

  const canApprove = proposal.status === 'submitted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' || proposal.status === 'accepted'

  const speakers = extractSpeakersFromProposal(proposal)
  const indicators = getSpeakerIndicators(speakers)
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
          <div className="flex flex-shrink-0 items-center gap-2">
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
            <div className="flex flex-shrink-0 items-center gap-2">
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
            <div className="flex flex-shrink-0 items-center gap-2">
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

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleEditProposal}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            title="Edit proposal"
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </button>

          {speakers.length > 0 && (
            <button
              onClick={handlePreviewSpeaker}
              className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
              title="Preview speaker profile"
            >
              <EyeIcon className="h-3 w-3" />
              Preview
            </button>
          )}

          {speakers.length > 0 && speakers.some((speaker) => speaker.email) && (
            <button
              onClick={handleEmailSpeakers}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              title={`Email ${speakers.length === 1 ? speakers.filter((s) => s.email)[0]?.name : `${speakers.filter((s) => s.email).length} speakers`}`}
            >
              <EnvelopeIcon className="h-3 w-3" />
              Email
            </button>
          )}

          {canApprove && (
            <button
              onClick={() => handleAction(Action.accept)}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            >
              <CheckIcon className="h-3 w-3" />
              Approve
            </button>
          )}
          {canRemind && (
            <button
              onClick={() => handleAction(Action.remind)}
              className="inline-flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600"
            >
              <BellIcon className="h-3 w-3" />
              Remind
            </button>
          )}
          {canReject && (
            <button
              onClick={() => handleAction(Action.reject)}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
            >
              <XMarkIcon className="h-3 w-3" />
              Reject
            </button>
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
