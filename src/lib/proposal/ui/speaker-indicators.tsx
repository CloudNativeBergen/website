import React from 'react'
import {
  StarIcon as StarIconSolid,
  UserPlusIcon,
  MapPinIcon,
  HeartIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid'
import { SpeakerWithReviewInfo, Flags, Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { hasPreviousAcceptedTalks } from '@/lib/speaker/utils'

export interface SpeakerIndicator {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  bgColor: string
  textColor: string
  title: string
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

  const isSeasonedSpeaker = speakers.some((speaker) => {
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

  const isNewSpeaker =
    speakers.length === 0 ||
    speakers.every((speaker) => {
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
