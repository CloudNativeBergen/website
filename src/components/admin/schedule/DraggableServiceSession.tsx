'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { TrackTalk } from '@/lib/conference/types'
import { ClockIcon, Bars3Icon } from '@heroicons/react/24/outline'

interface DraggableServiceSessionProps {
  serviceSession: TrackTalk
  sourceTrackIndex?: number
  sourceTimeSlot?: string
  isDragging?: boolean
}

// Constants for styling
const MINUTES_TO_PIXELS = 2.4
const SERVICE_SESSION_THRESHOLDS = {
  SHORT: 15,
  MEDIUM: 25,
  LONG: 45,
} as const

export function DraggableServiceSession({
  serviceSession,
  sourceTrackIndex,
  sourceTimeSlot,
  isDragging = false,
}: DraggableServiceSessionProps) {
  // Memoize expensive calculations
  const { dragType, durationMinutes, sessionSize, dragId } = useMemo(() => {
    // Calculate duration
    const startTime = new Date(`2000-01-01T${serviceSession.startTime}:00`)
    const endTime = new Date(`2000-01-01T${serviceSession.endTime}:00`)
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60)

    // Determine session size category
    let size: 'short' | 'medium' | 'long' | 'very-long'
    if (duration <= SERVICE_SESSION_THRESHOLDS.SHORT) size = 'short'
    else if (duration <= SERVICE_SESSION_THRESHOLDS.MEDIUM) size = 'medium'
    else if (duration <= SERVICE_SESSION_THRESHOLDS.LONG) size = 'long'
    else size = 'very-long'

    const type =
      sourceTrackIndex !== undefined ? 'scheduled-service' : 'service-session'
    const id = `${type}-${serviceSession.startTime}-${sourceTrackIndex || 'unassigned'}-${sourceTimeSlot || 'new'}`

    return {
      dragType: type,
      durationMinutes: duration,
      sessionSize: size,
      dragId: id,
    }
  }, [serviceSession, sourceTrackIndex, sourceTimeSlot])

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
      serviceSession: {
        placeholder: serviceSession.placeholder || 'Service Session',
        startTime: serviceSession.startTime,
        endTime: serviceSession.endTime,
      },
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
      'relative max-w-full overflow-hidden rounded-lg border bg-gray-100 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-gray-600 dark:bg-gray-700'
    const opacityClass = isBeingDragged
      ? 'opacity-30'
      : isDragging
        ? 'opacity-50'
        : ''
    const paddingClass = sessionSize === 'short' ? 'p-1' : 'p-2'

    return `${baseClasses} ${opacityClass} ${paddingClass}`.trim()
  }, [isBeingDragged, isDragging, sessionSize])

  // Title component based on session size
  const TitleComponent = useMemo(() => {
    const titleClasses = 'pr-1 text-gray-900 truncate dark:text-white'

    switch (sessionSize) {
      case 'short':
      case 'medium':
        return (
          <h3
            className={`line-clamp-1 text-xs leading-tight font-medium ${titleClasses}`}
          >
            {serviceSession.placeholder || 'Service Session'}
          </h3>
        )
      default:
        return (
          <h3 className={`line-clamp-2 text-sm font-semibold ${titleClasses}`}>
            {serviceSession.placeholder || 'Service Session'}
          </h3>
        )
    }
  }, [sessionSize, serviceSession.placeholder])

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
      {/* Header row with drag handle and title */}
      <div className="flex min-h-[16px] items-center gap-1">
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-200 dark:hover:bg-gray-600"
          {...listeners}
        >
          <Bars3Icon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
        </div>

        {/* Title - takes remaining space and aligns with other proposals */}
        <div className="min-w-0 flex-1">{TitleComponent}</div>

        {/* Duration indicator */}
        <div className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <ClockIcon
            className={
              sessionSize === 'short' || sessionSize === 'medium'
                ? 'h-2.5 w-2.5'
                : 'h-3 w-3'
            }
          />
          <span className="tabular-nums">{durationMinutes}m</span>
        </div>
      </div>

      {/* Content below header - only for long and very-long sessions (30+ minutes) */}
      {(sessionSize === 'long' || sessionSize === 'very-long') && (
        <div className="mt-1 space-y-1">
          {/* Session type indicator - only show for sessions 30+ minutes */}
          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
            <span>Service Session</span>
          </div>

          {/* Time range for very-long sessions */}
          {sessionSize === 'very-long' && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {serviceSession.startTime} - {serviceSession.endTime}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
