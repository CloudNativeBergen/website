import React from 'react'
import {
  StarIcon as StarIconSolid,
  UserPlusIcon,
  MapPinIcon,
  HeartIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid'
import { SpeakerWithReviewInfo, Flags, Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Status } from '@/lib/proposal/types'

/**
 * Speaker indicator configuration for consistent speaker indicators
 */
export interface SpeakerIndicator {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  bgColor: string
  textColor: string
  title: string
}

/**
 * Helper function to determine if a speaker has previous accepted talks
 * Works with speakers that have proposals from multiple conferences
 */
function hasPreviousAcceptedTalks(
  speaker: Speaker & { proposals?: ProposalExisting[] },
  currentConferenceId?: string,
): boolean {
  if (!speaker.proposals || speaker.proposals.length === 0) {
    return false
  }

  // If no current conference ID provided, we can't determine what's "previous"
  if (!currentConferenceId) {
    return false
  }

  // Look for accepted or confirmed talks from other conferences
  return speaker.proposals.some((proposal) => {
    const isAcceptedOrConfirmed =
      proposal.status === Status.accepted ||
      proposal.status === Status.confirmed

    if (!isAcceptedOrConfirmed) {
      return false
    }

    // Check if this proposal is from a different conference
    if (proposal.conference) {
      const proposalConferenceId =
        typeof proposal.conference === 'object' && '_id' in proposal.conference
          ? proposal.conference._id
          : proposal.conference
      return proposalConferenceId !== currentConferenceId
    }

    // If no conference info on proposal, can't determine if it's previous
    return false
  })
}

/**
 * Get speaker indicators based on speaker data
 * Returns array of indicators to display for speakers
 *
 * @param speakers - Array of speakers to analyze
 * @param currentConferenceId - Current conference ID to exclude when determining if speaker is new
 */
export function getSpeakerIndicators(
  speakers: (
    | SpeakerWithReviewInfo
    | (Speaker & { proposals?: ProposalExisting[] })
  )[],
  currentConferenceId?: string,
): SpeakerIndicator[] {
  const indicators: SpeakerIndicator[] = []

  // Check for seasoned speaker (has previous accepted talks)
  const isSeasonedSpeaker = speakers.some((speaker) => {
    // Check both old and new data structures
    if ('previousAcceptedTalks' in speaker && speaker.previousAcceptedTalks) {
      return speaker.previousAcceptedTalks.length > 0
    }
    return hasPreviousAcceptedTalks(speaker, currentConferenceId)
  })

  if (isSeasonedSpeaker) {
    indicators.push({
      icon: StarIconSolid,
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
      title: 'Seasoned speaker - has previous accepted talks',
    })
  }

  // Check for new speaker (no previous accepted talks)
  const isNewSpeaker =
    speakers.length === 0 ||
    speakers.every((speaker) => {
      // Check both old and new data structures
      if (
        'previousAcceptedTalks' in speaker &&
        speaker.previousAcceptedTalks !== undefined
      ) {
        return speaker.previousAcceptedTalks.length === 0
      }
      return !hasPreviousAcceptedTalks(speaker, currentConferenceId)
    })

  if (isNewSpeaker && speakers.length > 0) {
    indicators.push({
      icon: UserPlusIcon,
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
      title: 'New speaker - no previous accepted talks',
    })
  }

  // Check for local speaker
  const isLocalSpeaker = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.localSpeaker),
  )
  if (isLocalSpeaker) {
    indicators.push({
      icon: MapPinIcon,
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
      title: 'Local speaker',
    })
  }

  // Check for underrepresented speaker
  const isUnderrepresentedSpeaker = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.diverseSpeaker),
  )
  if (isUnderrepresentedSpeaker) {
    indicators.push({
      icon: HeartIcon,
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-700',
      title: 'Underrepresented speaker',
    })
  }

  // Check for travel funding requirement
  const requiresTravelFunding = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.requiresTravelFunding),
  )
  if (requiresTravelFunding) {
    indicators.push({
      icon: ExclamationTriangleIcon,
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
      title: 'Requires travel funding',
    })
  }

  return indicators
}

/**
 * Reusable SpeakerIndicators component
 */
interface SpeakerIndicatorsProps {
  speakers: (
    | SpeakerWithReviewInfo
    | (Speaker & { proposals?: ProposalExisting[] })
  )[]
  size?: 'sm' | 'md'
  maxVisible?: number
  className?: string
  currentConferenceId?: string
}

export function SpeakerIndicators({
  speakers,
  size = 'md',
  maxVisible = 5,
  className = '',
  currentConferenceId,
}: SpeakerIndicatorsProps) {
  const indicators = getSpeakerIndicators(speakers, currentConferenceId)
  const visibleIndicators = indicators.slice(0, maxVisible)
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3 w-3'
  const containerSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  if (visibleIndicators.length === 0) return null

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {visibleIndicators.map((indicator, index) => (
        <div
          key={index}
          className={`flex items-center justify-center rounded-full ${containerSize} ${indicator.bgColor} ${indicator.textColor}`}
          title={indicator.title}
        >
          <indicator.icon className={iconSize} />
        </div>
      ))}
    </div>
  )
}
