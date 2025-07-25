import React from 'react'
import {
  StarIcon as StarIconSolid,
  UserPlusIcon,
  MapPinIcon,
  HeartIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid'
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'

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
 * Get speaker indicators based on speaker data
 * Returns array of indicators to display for speakers
 */
export function getSpeakerIndicators(
  speakers: SpeakerWithReviewInfo[],
): SpeakerIndicator[] {
  const indicators: SpeakerIndicator[] = []

  // Check for seasoned speaker
  const isSeasonedSpeaker = speakers.some(
    (speaker) =>
      speaker?.previousAcceptedTalks &&
      speaker.previousAcceptedTalks.length > 0,
  )
  if (isSeasonedSpeaker) {
    indicators.push({
      icon: StarIconSolid,
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
      title: 'Seasoned speaker - has previous accepted talks',
    })
  }

  // Check for new speaker
  const isNewSpeaker =
    speakers.length === 0 ||
    speakers.every(
      (speaker) =>
        !speaker?.previousAcceptedTalks ||
        speaker.previousAcceptedTalks.length === 0,
    )
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
  speakers: SpeakerWithReviewInfo[]
  size?: 'sm' | 'md'
  maxVisible?: number
  className?: string
}

export function SpeakerIndicators({
  speakers,
  size = 'md',
  maxVisible = 5,
  className = '',
}: SpeakerIndicatorsProps) {
  const indicators = getSpeakerIndicators(speakers)
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
