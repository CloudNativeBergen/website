'use client'

import { UserIcon, ClockIcon, StarIcon } from '@heroicons/react/24/outline'
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { ProposalExisting, statuses, formats, levels, languages, audiences } from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { getStatusBadgeStyle } from './utils'
import { calculateAverageRating } from './hooks'
import { sanityImage } from '@/lib/sanity/client'

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
  isSelected = false
}: ProposalCardProps) {
  const speaker = typeof proposal.speaker === 'object' && proposal.speaker && 'name' in proposal.speaker
    ? proposal.speaker as Speaker
    : null

  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const requiresTravelFunding = speaker?.flags?.includes(Flags.requiresTravelFunding) || false

  const CardContent = () => (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0">
        {speaker?.image ? (
          <img
            src={sanityImage(speaker.image).width(96).height(96).fit('crop').url()}
            alt={speaker.name || 'Speaker'}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-gray-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          {/* Header row with title and status */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">
              {proposal.title}
            </h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusBadgeStyle(proposal.status)}`}>
              {statuses.get(proposal.status) || proposal.status || 'Unknown'}
            </span>
          </div>

          {/* Speaker name */}
          <div className="flex items-center text-sm text-gray-600 mb-2">
            <span className="font-medium truncate">
              {speaker?.name || 'Unknown Speaker'}
            </span>
            {requiresTravelFunding && (
              <div className="ml-2 flex items-center">
                <ExclamationTriangleIcon
                  className="h-4 w-4 text-red-500"
                  title="Requires travel funding"
                />
              </div>
            )}
          </div>

          {/* Metadata in compact rows */}
          <div className="space-y-1">
            <div className="flex items-center text-sm text-gray-500">
              <ClockIcon className="mr-1 h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {formats.get(proposal.format) || proposal.format || 'Not specified'}
              </span>
            </div>

            {/* Rating display */}
            {reviewCount > 0 && (
              <div className="flex items-center text-sm text-gray-500">
                <div className="flex items-center mr-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    star <= Math.round(averageRating) ? (
                      <StarIconSolid
                        key={star}
                        className="h-4 w-4 text-yellow-400"
                      />
                    ) : (
                      <StarIcon
                        key={star}
                        className="h-4 w-4 text-gray-300"
                      />
                    )
                  ))}
                </div>
                <span className="text-xs">
                  {averageRating.toFixed(1)} ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
                </span>
              </div>
            )}

            <div className="text-xs text-gray-500">
              {levels.get(proposal.level) || proposal.level || 'Level not specified'} • {languages.get(proposal.language) || proposal.language || 'Language not specified'}
            </div>
            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="text-xs text-gray-500 line-clamp-1">
                Audience: {proposal.audiences.map(aud => audiences.get(aud) || aud).join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  const baseCardClasses = "relative rounded-lg border bg-white px-6 py-5 shadow-sm transition-all duration-200"
  const cardClasses = `${baseCardClasses} ${isSelected
    ? "border-indigo-500 bg-indigo-50 shadow-md"
    : "border-gray-300 hover:border-gray-400 hover:shadow-md"
    } ${onSelect ? "cursor-pointer" : ""
    }`

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
        <div className="absolute top-3 left-3 lg:block hidden">
          <div className={`h-2 w-2 rounded-full ${isSelected ? "bg-indigo-500" : "bg-gray-300"
            }`} />
        </div>
      )}
    </Link>
  )
}
