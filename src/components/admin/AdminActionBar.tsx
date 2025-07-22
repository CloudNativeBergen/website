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
} from '@heroicons/react/20/solid'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'
import { SpeakerEmailModal } from './SpeakerEmailModal'

interface AdminActionBarProps {
  proposal: ProposalExisting
  domain?: string
}

export function AdminActionBar({ proposal, domain }: AdminActionBarProps) {
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [speakersWithEmail, setSpeakersWithEmail] = useState<
    {
      id: string
      name: string
      email: string
    }[]
  >([])

  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  const handleEmailSpeakers = () => {
    // Get all speakers with email addresses
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

  const canApprove = proposal.status === 'submitted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' || proposal.status === 'accepted'

  // Get speaker information for indicators
  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as SpeakerWithReviewInfo)
      : []
  const isSeasonedSpeaker = speakers.some(
    (speaker) =>
      speaker?.previousAcceptedTalks &&
      speaker.previousAcceptedTalks.length > 0,
  )
  const isNewSpeaker =
    speakers.length === 0 ||
    speakers.every(
      (speaker) =>
        !speaker?.previousAcceptedTalks ||
        speaker.previousAcceptedTalks.length === 0,
    )
  const isLocalSpeaker = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.localSpeaker),
  )
  const isUnderrepresentedSpeaker = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.diverseSpeaker),
  )
  const requiresTravelSupport = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.requiresTravelFunding),
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left side - Status, Reviews, and Speaker Indicators */}
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/* Status */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Status:</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                proposal.status === 'accepted'
                  ? 'bg-green-100 text-green-800'
                  : proposal.status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : proposal.status === 'submitted'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
              }`}
            >
              {proposal.status.charAt(0).toUpperCase() +
                proposal.status.slice(1)}
            </span>
          </div>

          {/* Reviews Summary */}
          {proposal.reviews && proposal.reviews.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600">
                Reviews:
              </span>
              <span className="text-sm whitespace-nowrap text-gray-900">
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

          {/* Speaker Indicators */}
          {speakers.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600">
                Speaker:
              </span>
              <div className="flex items-center gap-1">
                {isSeasonedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-700"
                    title="Seasoned speaker - has previous accepted talks"
                  >
                    <StarIcon className="h-3 w-3" />
                  </div>
                )}
                {isNewSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700"
                    title="New speaker - no previous accepted talks"
                  >
                    <UserPlusIcon className="h-3 w-3" />
                  </div>
                )}
                {isLocalSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"
                    title="Local speaker"
                  >
                    <MapPinIcon className="h-3 w-3" />
                  </div>
                )}
                {isUnderrepresentedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700"
                    title="Underrepresented speaker"
                  >
                    <HeartIcon className="h-3 w-3" />
                  </div>
                )}
                {requiresTravelSupport && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700"
                    title="Requires travel support"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side - Compact Action Buttons */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Email Speaker Button - Show if there's at least one speaker with email */}
          {speakers.length > 0 && speakers.some((speaker) => speaker.email) && (
            <button
              onClick={handleEmailSpeakers}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              title={`Email ${speakers.length === 1 ? speakers.filter((s) => s.email)[0]?.name : `${speakers.filter((s) => s.email).length} speakers`}`}
            >
              <EnvelopeIcon className="h-3 w-3" />
              Email
            </button>
          )}

          {canApprove && (
            <button
              onClick={() => handleAction(Action.accept)}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
            >
              <CheckIcon className="h-3 w-3" />
              Approve
            </button>
          )}
          {canRemind && (
            <button
              onClick={() => handleAction(Action.remind)}
              className="inline-flex items-center gap-1 rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-yellow-700"
            >
              <BellIcon className="h-3 w-3" />
              Remind
            </button>
          )}
          {canReject && (
            <button
              onClick={() => handleAction(Action.reject)}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              <XMarkIcon className="h-3 w-3" />
              Reject
            </button>
          )}
        </div>
      </div>

      {/* Email Modal */}
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
        />
      )}
    </div>
  )
}
