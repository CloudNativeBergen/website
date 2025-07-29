'use client'

import {
  UserIcon,
  ClockIcon,
  UserPlusIcon,
  MapPinIcon,
  HeartIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import Link from 'next/link'
import {
  ProposalExisting,
  formats,
  levels,
  languages,
  audiences,
} from '@/lib/proposal/types'
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'
import { SpeakerAvatars } from '../SpeakerAvatars'
import {
  StatusBadge,
  RatingDisplay,
  getProposalSpeakerNames,
  calculateAverageRating,
} from '@/lib/proposal'
import { CoSpeakerInvitation } from '@/lib/cospeaker/types'
import { InvitationBadges } from '../InvitationBadges'
import { useEffect, useState } from 'react'
import { fetchInvitationsForProposal } from '@/lib/cospeaker/client'

interface ProposalCardProps {
  proposal: ProposalExisting
  href?: string
  onSelect?: () => void
  isSelected?: boolean
  invitations?: CoSpeakerInvitation[]
}

/**
 * Individual proposal card component for admin interface
 * Displays proposal information with speaker image, metadata, and status
 */
export function ProposalCard({
  proposal,
  href,
  onSelect,
  isSelected = false,
  invitations: initialInvitations,
}: ProposalCardProps) {
  const [invitations, setInvitations] = useState<CoSpeakerInvitation[]>(
    initialInvitations || [],
  )

  // Auto-load invitations if not provided and applicable
  useEffect(() => {
    if (
      !initialInvitations &&
      (proposal.format.startsWith('presentation') ||
        proposal.format.startsWith('workshop'))
    ) {
      fetchInvitationsForProposal(proposal._id)
        .then(setInvitations)
        .catch(console.error)
    }
  }, [proposal._id, proposal.format, initialInvitations])

  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as SpeakerWithReviewInfo)
      : []

  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const speakerNames = getProposalSpeakerNames(proposal)

  // Calculate speaker indicators
  const isSeasonedSpeaker = speakers.some(
    (speaker) => speaker.previousAcceptedTalks && speaker.previousAcceptedTalks.length > 0
  )
  const isNewSpeaker = speakers.some(
    (speaker) => !speaker.previousAcceptedTalks || speaker.previousAcceptedTalks.length === 0
  )
  const isLocalSpeaker = speakers.some(
    (speaker) => speaker.flags?.includes(Flags.localSpeaker)
  )
  const isUnderrepresentedSpeaker = speakers.some(
    (speaker) => speaker.flags?.includes(Flags.diverseSpeaker)
  )
  const requiresTravelFunding = speakers.some(
    (speaker) => speaker.flags?.includes(Flags.requiresTravelFunding)
  )

  const CardContent = () => (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0">
        {proposal.speakers &&
        Array.isArray(proposal.speakers) &&
        proposal.speakers.length > 0 ? (
          <SpeakerAvatars
            speakers={proposal.speakers}
            size="md"
            maxVisible={3}
          />
        ) : (
          <div className="bg-sky-mist flex h-12 w-12 items-center justify-center rounded-full">
            <UserIcon className="text-cloud-blue h-6 w-6" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          {/* Header row with title and status */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-cloud-blue-dark line-clamp-2 flex-1 text-sm font-medium">
              {proposal.title}
            </h3>
            <StatusBadge
              status={proposal.status}
              variant="compact"
              className="flex-shrink-0"
            />
          </div>

          {/* Speaker name with indicators */}
          <div className="text-cloud-blue mb-2 flex items-center justify-between text-sm">
            <div className="flex min-w-0 flex-1 items-center">
              <span className="truncate font-medium">{speakerNames}</span>
            </div>

            {/* Speaker Indicators */}
            {speakers.length > 0 && (
              <div className="ml-2 flex items-center gap-1">
                {isSeasonedSpeaker && (
                  <div
                    className="bg-sunbeam-yellow/20 text-sunbeam-yellow-dark flex h-5 w-5 items-center justify-center rounded-full"
                    aria-label="Seasoned speaker - has previous accepted talks"
                    title="Seasoned speaker - has previous accepted talks"
                  >
                    <StarIconSolid className="h-3 w-3" aria-hidden="true" />
                  </div>
                )}
                {isNewSpeaker && (
                  <div
                    className="bg-cloud-blue/10 text-cloud-blue-dark flex h-5 w-5 items-center justify-center rounded-full"
                    aria-label="New speaker - no previous accepted talks"
                    title="New speaker - no previous accepted talks"
                  >
                    <UserPlusIcon className="h-3 w-3" aria-hidden="true" />
                  </div>
                )}
                {isLocalSpeaker && (
                  <div
                    className="bg-fresh-green/10 text-fresh-green-dark flex h-5 w-5 items-center justify-center rounded-full"
                    aria-label="Local speaker"
                    title="Local speaker"
                  >
                    <MapPinIcon className="h-3 w-3" aria-hidden="true" />
                  </div>
                )}
                {isUnderrepresentedSpeaker && (
                  <div
                    className="bg-nordic-purple/10 text-nordic-purple-dark flex h-5 w-5 items-center justify-center rounded-full"
                    aria-label="Underrepresented speaker"
                    title="Underrepresented speaker"
                  >
                    <HeartIcon className="h-3 w-3" aria-hidden="true" />
                  </div>
                )}
                {requiresTravelFunding && (
                  <div
                    className="bg-cloud-blue/20 text-cloud-blue-dark flex h-5 w-5 items-center justify-center rounded-full"
                    aria-label="Requires travel funding"
                    title="Requires travel funding"
                  >
                    <ExclamationTriangleIcon
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metadata in compact rows */}
          <div className="space-y-1">
            <div className="text-cloud-blue/70 flex items-center text-sm">
              <ClockIcon
                className="text-cloud-blue mr-1 h-4 w-4 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">
                {formats.get(proposal.format) ||
                  proposal.format ||
                  'Not specified'}
              </span>
            </div>

            {/* Rating display */}
            {reviewCount > 0 && (
              <RatingDisplay
                rating={averageRating}
                reviewCount={reviewCount}
                size="sm"
                showText={true}
              />
            )}

            <div className="text-cloud-blue/60 text-xs">
              {levels.get(proposal.level) ||
                proposal.level ||
                'Level not specified'}{' '}
              •{' '}
              {languages.get(proposal.language) ||
                proposal.language ||
                'Language not specified'}
            </div>

            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="text-cloud-blue/60 line-clamp-1 text-xs">
                Audience:{' '}
                {proposal.audiences
                  .map((aud) => audiences.get(aud) || aud)
                  .join(', ')}
              </div>
            )}

            {/* Co-speaker invitations */}
            {(proposal.format.startsWith('presentation') ||
              proposal.format.startsWith('workshop')) &&
              invitations.length > 0 && (
                <div className="mt-1">
                  <InvitationBadges invitations={invitations} size="sm" />
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  )

  const baseCardClasses =
    'relative rounded-lg border bg-white px-6 py-5 shadow-sm transition-all duration-200'
  const cardClasses = `${baseCardClasses} ${
    isSelected
      ? 'border-cloud-blue bg-sky-mist shadow-md'
      : 'border-sky-mist-dark hover:border-cloud-blue/50 hover:shadow-md'
  } ${onSelect ? 'cursor-pointer' : ''}`

  const handleClick = (e: React.MouseEvent) => {
    // On large screens (lg+), if onSelect is provided, use preview mode
    const isLargeScreen = window.innerWidth >= 1024 // lg breakpoint
    if (onSelect && isLargeScreen) {
      e.preventDefault()
      onSelect()
    }
    // On smaller screens, let the Link handle navigation naturally
  }

  return (
    <Link href={href || '#'} className={cardClasses} onClick={handleClick}>
      <CardContent />
      {onSelect && (
        <div className="absolute top-3 left-3 hidden lg:block">
          <div
            className={`h-2 w-2 rounded-full ${
              isSelected ? 'bg-cloud-blue' : 'bg-sky-mist-dark'
            }`}
          />
        </div>
      )}
    </Link>
  )
}
