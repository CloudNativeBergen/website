'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'
import { formats, levels, audiences } from '@/lib/proposal/types'
import { getProposalDurationMinutes } from '@/lib/schedule/types'
import { Topic } from '@/lib/topic/types'
import { LevelIndicator, useLevelConfig } from '@/lib/proposal/level-indicator'
import {
  ClockIcon,
  UserIcon,
  Bars3Icon,
  CodeBracketIcon,
  CubeIcon,
  CogIcon,
  UserGroupIcon,
  AcademicCapIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import './schedule.css'

interface DraggableProposalProps {
  proposal: ProposalExisting
  sourceTrackIndex?: number
  sourceTimeSlot?: string
  isDragging?: boolean
}

// Talk size thresholds as constants
const TALK_THRESHOLDS = {
  VERY_SHORT: 10,
  SHORT: 20,
  MEDIUM: 45,
} as const

// Height calculation constant
const MINUTES_TO_PIXELS = 2.4

// Audience abbreviations and icons
const AUDIENCE_CONFIG = {
  developer: { abbr: 'DEV', icon: CodeBracketIcon },
  architect: { abbr: 'ARC', icon: CubeIcon },
  operator: { abbr: 'OPS', icon: CogIcon },
  manager: { abbr: 'MGR', icon: UserGroupIcon },
  dataEngineer: { abbr: 'DATA', icon: AcademicCapIcon },
  securityEngineer: { abbr: 'SEC', icon: CodeBracketIcon },
  qaEngineer: { abbr: 'QA', icon: CodeBracketIcon },
  devopsEngineer: { abbr: 'DEVOPS', icon: CogIcon },
} as const

export function DraggableProposal({
  proposal,
  sourceTrackIndex,
  sourceTimeSlot,
  isDragging = false,
}: DraggableProposalProps) {
  // Memoize expensive calculations
  const { dragType, durationMinutes, talkSize, dragId, speakerInfo } =
    useMemo(() => {
      const duration = getProposalDurationMinutes(proposal)
      const type =
        sourceTrackIndex !== undefined ? 'scheduled-talk' : 'proposal'
      const id = `${type}-${proposal._id}-${sourceTimeSlot || 'unassigned'}`

      // Determine talk size category
      let size: 'very-short' | 'short' | 'medium' | 'long'
      if (duration <= TALK_THRESHOLDS.VERY_SHORT) size = 'very-short'
      else if (duration <= TALK_THRESHOLDS.SHORT) size = 'short'
      else if (duration <= TALK_THRESHOLDS.MEDIUM) size = 'medium'
      else size = 'long'

      // Extract speaker info if available
      const speaker =
        proposal.speakers &&
        Array.isArray(proposal.speakers) &&
        proposal.speakers.length > 0 &&
        proposal.speakers[0] &&
        typeof proposal.speakers[0] === 'object' &&
        'name' in proposal.speakers[0]
          ? proposal.speakers[0].name
          : null

      return {
        dragType: type,
        durationMinutes: duration,
        talkSize: size,
        dragId: id,
        speakerInfo: speaker,
      }
    }, [proposal, sourceTrackIndex, sourceTimeSlot])

  // Process topics and determine styling based on proposal data
  const styling = useMemo(() => {
    // Process topics for color coding - use direct inline styles for reliability
    const topics = proposal.topics as Topic[]
    if (topics && topics.length > 0) {
      // Helper function to ensure color has # prefix
      const formatColor = (color: string) =>
        color.startsWith('#') ? color : `#${color}`

      // Use CSS custom properties for the pseudo-elements
      const styles: React.CSSProperties & Record<string, string> = {
        '--topic-1-color': formatColor(topics[0].color),
        position: 'relative' as const,
      }

      if (topics.length >= 2) {
        styles['--topic-2-color'] = formatColor(topics[1].color)
      }

      return styles
    }
    return { position: 'relative' as const }
  }, [proposal.topics])

  // Create a simple style element for this specific component
  const topicStyleElement = useMemo(() => {
    const topics = proposal.topics as Topic[]
    if (!topics || topics.length === 0) return null

    const uniqueId = `proposal-${proposal._id}`
    let cssContent = ''

    // Helper function to ensure color has # prefix
    const formatColor = (color: string) =>
      color.startsWith('#') ? color : `#${color}`

    if (topics.length === 1) {
      const color1 = formatColor(topics[0].color)
      cssContent = `
        .${uniqueId}::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background-color: ${color1};
          z-index: 1;
        }
        .${uniqueId} > * {
          position: relative;
          z-index: 2;
        }
      `
    } else if (topics.length >= 2) {
      const color1 = formatColor(topics[0].color)
      const color2 = formatColor(topics[1].color)
      cssContent = `
        .${uniqueId}::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(45deg, ${color1} 50%, ${color2} 50%);
          z-index: 1;
        }
        .${uniqueId} > * {
          position: relative;
          z-index: 2;
        }
      `
    }

    return { uniqueId, cssContent }
  }, [proposal.topics, proposal._id])

  // Enhanced background styling based on topics
  const backgroundStyle = useMemo(() => {
    const topics = proposal.topics as Topic[]
    if (topics && topics.length > 0) {
      const background =
        topics.length === 1
          ? `${topics[0].color}08` // 8 = ~3% opacity
          : `linear-gradient(135deg, ${topics[0].color}08 50%, ${topics[1].color}08 50%)`

      return { background }
    }
    return {}
  }, [proposal.topics])

  // Get level configuration using the utility hook
  const levelConfig = useLevelConfig(proposal.level)

  // Process audiences
  const { primaryAudience, audienceCount } = useMemo(() => {
    if (!proposal.audiences || proposal.audiences.length === 0) {
      return { primaryAudience: null, audienceCount: 0 }
    }
    return {
      primaryAudience: AUDIENCE_CONFIG[proposal.audiences[0]],
      audienceCount: proposal.audiences.length,
    }
  }, [proposal.audiences])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isBeingDragged,
  } = useDraggable({
    id: dragId,
    data: {
      type: dragType,
      proposal,
      sourceTrackIndex,
      sourceTimeSlot,
    },
  })

  // Memoize transform style
  const transformStyle = useMemo(() => {
    if (!transform || isBeingDragged) return undefined
    return {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
  }, [transform, isBeingDragged])

  // Memoize class names
  const containerClasses = useMemo(() => {
    const baseClasses =
      'relative max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md'
    const opacityClass = isBeingDragged
      ? 'opacity-30'
      : isDragging
        ? 'opacity-50'
        : ''

    const paddingClass =
      talkSize === 'short' || talkSize === 'very-short' ? 'p-1' : 'p-2'

    return `${baseClasses} ${opacityClass} ${paddingClass}`.trim()
  }, [isBeingDragged, isDragging, talkSize])

  // Title component based on talk size
  const TitleComponent = useMemo(() => {
    const titleClasses = 'pr-1 text-gray-900 truncate'

    switch (talkSize) {
      case 'very-short':
        return (
          <h3
            className={`line-clamp-1 text-xs leading-tight font-medium ${titleClasses}`}
          >
            {proposal.title}
          </h3>
        )
      case 'short':
        return (
          <h3
            className={`line-clamp-2 text-xs leading-tight font-medium ${titleClasses}`}
          >
            {proposal.title}
          </h3>
        )
      default:
        return (
          <h3 className={`line-clamp-2 text-sm font-semibold ${titleClasses}`}>
            {proposal.title}
          </h3>
        )
    }
  }, [talkSize, proposal.title])

  // Speaker component
  const SpeakerComponent = useMemo(() => {
    if (!speakerInfo) return null

    return (
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <UserIcon className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{speakerInfo}</span>
      </div>
    )
  }, [speakerInfo])

  // Audience indicator component - now always visible when available
  const AudienceIndicator = useMemo(() => {
    if (!primaryAudience) return null

    const countText = audienceCount > 1 ? ` +${audienceCount - 1}` : ''

    return (
      <div className="flex items-center gap-1">
        <UserGroupIcon className="h-3 w-3 flex-shrink-0 text-gray-500" />
        <span
          className="text-xs font-medium text-gray-600"
          title={`Primary: ${audiences.get(proposal.audiences?.[0])}${
            audienceCount > 1 ? ` (${audienceCount} total)` : ''
          }`}
        >
          {primaryAudience.abbr}
          {countText}
        </span>
      </div>
    )
  }, [primaryAudience, audienceCount, proposal.audiences])

  // Topics indicator component
  const TopicsIndicator = useMemo(() => {
    if (!proposal.topics?.length) return null

    const topics = proposal.topics as Topic[]
    const displayTopics = topics.slice(0, 2)
    const remainingCount = topics.length - 2

    // Helper function to ensure color has # prefix
    const formatColor = (color: string) =>
      color.startsWith('#') ? color : `#${color}`

    return (
      <div className="flex items-center gap-1">
        <TagIcon className="h-3 w-3 flex-shrink-0 text-gray-500" />
        <div className="flex items-center gap-1">
          {displayTopics.map((topic, index) => (
            <span
              key={topic._id || index}
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: formatColor(topic.color) }}
              title={topic.title}
            />
          ))}
          {remainingCount > 0 && (
            <span className="text-xs text-gray-500">+{remainingCount}</span>
          )}
        </div>
      </div>
    )
  }, [proposal.topics])

  // Format display
  const formatDisplay = useMemo(() => {
    return formats.get(proposal.format) || proposal.format
  }, [proposal.format])

  // Enhanced tooltip content
  const tooltipContent = useMemo(() => {
    const parts = []

    // Basic info
    parts.push(`📋 ${proposal.title}`)
    if (speakerInfo) parts.push(`👤 ${speakerInfo}`)

    // Level with emoji
    const levelEmoji =
      levelConfig?.label === 'Beginner'
        ? '🟢'
        : levelConfig?.label === 'Intermediate'
          ? '🟡'
          : '🔴'
    if (levelConfig) {
      parts.push(`${levelEmoji} Level: ${levelConfig.label}`)
    }

    // Audiences
    if (proposal.audiences && proposal.audiences.length > 0) {
      const audienceNames = proposal.audiences
        .map((a) => audiences.get(a))
        .filter(Boolean)
      parts.push(`👥 Audience: ${audienceNames.join(', ')}`)
    }

    // Format and duration
    parts.push(`⏱️ ${formatDisplay} (${durationMinutes} min)`)

    // Topics with color indicators
    if (proposal.topics && proposal.topics.length > 0) {
      const topics = proposal.topics as Topic[]
      const topicList = topics.map((t) => `${t.title} (${t.color})`).join(', ')
      parts.push(`🏷️ Topics: ${topicList}`)
    }

    return parts.join('\n')
  }, [proposal, levelConfig, formatDisplay, durationMinutes, speakerInfo])

  return (
    <>
      {/* Inject dynamic topic color styles */}
      {topicStyleElement && (
        <style key={`topic-style-${proposal._id}`}>
          {topicStyleElement.cssContent}
        </style>
      )}

      <div
        ref={setNodeRef}
        className={`${containerClasses} ${topicStyleElement?.uniqueId || ''}`}
        style={{
          ...transformStyle,
          ...styling,
          ...backgroundStyle,
          height: `${durationMinutes * MINUTES_TO_PIXELS}px`,
        }}
        title={tooltipContent}
        {...attributes}
      >
        {/* Header row with drag handle, title, and duration */}
        <div className="flex min-h-[16px] items-center gap-1">
          {/* Drag handle */}
          <div
            className="flex-shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-100"
            {...listeners}
          >
            <Bars3Icon className="h-3 w-3 text-gray-400" />
          </div>

          {/* Title with level indicator */}
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 flex-1">{TitleComponent}</div>
            {levelConfig && (
              <LevelIndicator
                level={proposal.level}
                className="flex-shrink-0"
                size="xs"
              />
            )}
          </div>

          {/* Duration indicator */}
          <div className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500">
            <ClockIcon
              className={
                talkSize === 'short' || talkSize === 'very-short'
                  ? 'h-2.5 w-2.5'
                  : 'h-3 w-3'
              }
            />
            <span className="tabular-nums">{durationMinutes}m</span>
          </div>
        </div>

        {/* Enhanced info row for short talks */}
        {(talkSize === 'short' || talkSize === 'very-short') && (
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            {AudienceIndicator}
            {TopicsIndicator}
          </div>
        )}

        {/* Content below header - only for medium and long talks */}
        {(talkSize === 'medium' || talkSize === 'long') && (
          <div className="mt-1 space-y-1">
            {/* Enhanced info row for medium/long talks */}
            <div className="flex items-center gap-2 text-xs">
              {AudienceIndicator}
              {TopicsIndicator}
            </div>

            {/* Speaker */}
            {SpeakerComponent}

            {/* Format - only for long talks */}
            {talkSize === 'long' && (
              <div className="text-xs text-gray-500">{formatDisplay}</div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
