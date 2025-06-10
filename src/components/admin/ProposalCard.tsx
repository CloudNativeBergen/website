'use client'

import { UserIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import Image from 'next/image'
import { ProposalExisting, statuses, formats, levels, languages, audiences } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { getStatusBadgeStyle } from './utils'

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

  const CardContent = () => (
    <div className="flex items-start space-x-4">
      <div className="flex-shrink-0">
        {speaker?.image ? (
          <Image
            src={speaker.image}
            alt={speaker.name || 'Speaker'}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-gray-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="focus:outline-none">
          <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
            {proposal.title}
          </p>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <span className="font-medium truncate">
                {speaker?.name || 'Unknown Speaker'}
              </span>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <ClockIcon className="mr-1 h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {formats.get(proposal.format) || proposal.format || 'Not specified'}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {levels.get(proposal.level) || proposal.level || 'Level not specified'} • {languages.get(proposal.language) || proposal.language || 'Language not specified'}
            </div>
            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="text-xs text-gray-500">
                Audience: {proposal.audiences.map(aud => audiences.get(aud) || aud).join(', ')}
              </div>
            )}
          </div>
          <div className="mt-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeStyle(proposal.status)}`}>
              {statuses.get(proposal.status) || proposal.status || 'Unknown'}
            </span>
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

  const handleClick = () => {
    if (onSelect) {
      onSelect()
    }
  }

  if (href && !onSelect) {
    return (
      <Link href={href} className={cardClasses}>
        <CardContent />
      </Link>
    )
  }

  return (
    <div className={cardClasses} onClick={handleClick}>
      <CardContent />
      {onSelect && (
        <div className="absolute top-3 right-3">
          <div className={`h-2 w-2 rounded-full ${isSelected ? "bg-indigo-500" : "bg-gray-300"
            }`} />
        </div>
      )}
    </div>
  )
}
