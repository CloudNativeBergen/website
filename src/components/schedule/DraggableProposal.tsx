'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'
import { formats } from '@/lib/proposal/types'
import { getProposalDurationMinutes } from '@/lib/schedule/types'
import { ClockIcon, UserIcon, Bars3Icon } from '@heroicons/react/24/outline'
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
        proposal.speaker &&
        typeof proposal.speaker === 'object' &&
        'name' in proposal.speaker
          ? proposal.speaker.name
          : null

      return {
        dragType: type,
        durationMinutes: duration,
        talkSize: size,
        dragId: id,
        speakerInfo: speaker,
      }
    }, [proposal, sourceTrackIndex, sourceTimeSlot])

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
    const borderClass =
      sourceTrackIndex !== undefined ? 'border-l-4 border-l-blue-500' : ''
    const paddingClass =
      talkSize === 'short' || talkSize === 'very-short' ? 'p-1' : 'p-2'

    return `${baseClasses} ${opacityClass} ${borderClass} ${paddingClass}`.trim()
  }, [isBeingDragged, isDragging, sourceTrackIndex, talkSize])

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

  // Topics component
  const TopicsComponent = useMemo(() => {
    if (!proposal.topics?.length) return null

    const visibleTopics = proposal.topics.slice(0, 2)
    const remainingCount = proposal.topics.length - 2

    return (
      <div className="flex flex-wrap gap-1">
        {visibleTopics.map((topic, index) => (
          <span
            key={index}
            className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
          >
            {typeof topic === 'object' && 'title' in topic
              ? topic.title
              : 'Topic'}
          </span>
        ))}
        {remainingCount > 0 && (
          <span className="text-xs text-gray-400">+{remainingCount} more</span>
        )}
      </div>
    )
  }, [proposal.topics])

  // Format display
  const formatDisplay = useMemo(() => {
    return formats.get(proposal.format) || proposal.format
  }, [proposal.format])

  return (
    <div
      ref={setNodeRef}
      style={{
        ...transformStyle,
        height: `${durationMinutes * MINUTES_TO_PIXELS}px`,
      }}
      className={containerClasses}
      {...attributes}
    >
      {/* Header row with drag handle, title, and duration */}
      <div className="flex min-h-[16px] items-start gap-1">
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-100"
          {...listeners}
        >
          <Bars3Icon className="h-3 w-3 text-gray-400" />
        </div>

        {/* Title - takes remaining space */}
        <div className="min-w-0 flex-1">{TitleComponent}</div>

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

      {/* Content below header - only for medium and long talks */}
      {(talkSize === 'medium' || talkSize === 'long') && (
        <div className="mt-1 space-y-1">
          {/* Speaker */}
          {SpeakerComponent}

          {/* Format and Topics - only for long talks */}
          {talkSize === 'long' && (
            <>
              {/* Format */}
              <div className="text-xs text-gray-500">{formatDisplay}</div>

              {/* Topics */}
              {TopicsComponent}
            </>
          )}
        </div>
      )}
    </div>
  )
}
