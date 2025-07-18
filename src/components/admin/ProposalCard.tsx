'use client'

import {
  UserIcon,
  ClockIcon,
  StarIcon,
  UserPlusIcon,
  MapPinIcon,
  HeartIcon,
} from '@heroicons/react/24/outline'
import {
  ExclamationTriangleIcon,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid'
import Link from 'next/link'
import {
  ProposalExisting,
  statuses,
  formats,
  levels,
  languages,
  audiences,
} from '@/lib/proposal/types'
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'
import { SpeakerAvatars } from '../SpeakerAvatars'
import { getStatusBadgeStyle } from './utils'
import { calculateAverageRating } from './hooks'

interface ProposalCardProps {
  proposal: ProposalExisting
  href?: string
  onSelect?: () => void
  isSelected?: boolean
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
}: ProposalCardProps) {
  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as SpeakerWithReviewInfo)
      : []

  const primarySpeaker = speakers.length > 0 ? speakers[0] : null
  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const requiresTravelFunding =
    speakers.some((speaker) =>
      speaker?.flags?.includes(Flags.requiresTravelFunding),
    ) || false

  // Speaker indicators
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
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <UserIcon className="h-6 w-6 text-gray-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          {/* Header row with title and status */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 flex-1 text-sm font-medium text-gray-900">
              {proposal.title}
            </h3>
            <span
              className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeStyle(proposal.status)}`}
            >
              {statuses.get(proposal.status) || proposal.status || 'Unknown'}
            </span>
          </div>

          {/* Speaker name with indicators */}
          <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
            <div className="flex min-w-0 flex-1 items-center">
              <span className="truncate font-medium">
                {speakers.length > 0
                  ? speakers.map((s) => s.name).join(', ')
                  : 'Unknown Speaker'}
              </span>
            </div>

            {/* Speaker Indicators */}
            {speakers.length > 0 && (
              <div className="ml-2 flex items-center gap-1">
                {isSeasonedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-700"
                    title="Seasoned speaker - has previous accepted talks"
                  >
                    <StarIconSolid className="h-3 w-3" />
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
                {requiresTravelFunding && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700"
                    title="Requires travel funding"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metadata in compact rows */}
          <div className="space-y-1">
            <div className="flex items-center text-sm text-gray-500">
              <ClockIcon className="mr-1 h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {formats.get(proposal.format) ||
                  proposal.format ||
                  'Not specified'}
              </span>
            </div>

            {/* Rating display */}
            {reviewCount > 0 && (
              <div className="flex items-center text-sm text-gray-500">
                <div className="mr-2 flex items-center">
                  {[1, 2, 3, 4, 5].map((star) =>
                    star <= Math.round(averageRating) ? (
                      <StarIconSolid
                        key={star}
                        className="h-4 w-4 text-yellow-400"
                      />
                    ) : (
                      <StarIcon key={star} className="h-4 w-4 text-gray-300" />
                    ),
                  )}
                </div>
                <span className="text-xs">
                  {averageRating.toFixed(1)} ({reviewCount} review
                  {reviewCount !== 1 ? 's' : ''})
                </span>
              </div>
            )}

            <div className="text-xs text-gray-500">
              {levels.get(proposal.level) ||
                proposal.level ||
                'Level not specified'}{' '}
              •{' '}
              {languages.get(proposal.language) ||
                proposal.language ||
                'Language not specified'}
            </div>
            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="line-clamp-1 text-xs text-gray-500">
                Audience:{' '}
                {proposal.audiences
                  .map((aud) => audiences.get(aud) || aud)
                  .join(', ')}
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
      ? 'border-indigo-500 bg-indigo-50 shadow-md'
      : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
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
              isSelected ? 'bg-indigo-500' : 'bg-gray-300'
            }`}
          />
        </div>
      )}
    </Link>
  )
}
