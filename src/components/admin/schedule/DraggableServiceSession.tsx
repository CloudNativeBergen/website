'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { TrackTalk } from '@/lib/conference/types'
import { ClockIcon, Bars3Icon, CogIcon } from '@heroicons/react/24/outline'

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
  MEDIUM: 45,
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
    let size: 'short' | 'medium' | 'long'
    if (duration <= SERVICE_SESSION_THRESHOLDS.SHORT) size = 'short'
    else if (duration <= SERVICE_SESSION_THRESHOLDS.MEDIUM) size = 'medium'
    else size = 'long'

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
      'relative max-w-full overflow-hidden rounded-lg border bg-gray-100 shadow-sm transition-shadow duration-200 hover:shadow-md border-l-4 border-l-orange-500'
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
    const titleClasses = 'pr-1 text-gray-700 font-medium truncate'

    switch (sessionSize) {
      case 'short':
        return (
          <h3 className={`line-clamp-1 text-xs leading-tight ${titleClasses}`}>
            {serviceSession.placeholder || 'Service Session'}
          </h3>
        )
      default:
        return (
          <h3 className={`line-clamp-2 text-sm ${titleClasses}`}>
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
      {/* Header row with drag handle, title, and duration */}
      <div className="flex min-h-[16px] items-start gap-1">
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-200"
          {...listeners}
        >
          <Bars3Icon className="h-3 w-3 text-gray-500" />
        </div>

        {/* Service icon */}
        <div className="flex-shrink-0 pt-0.5">
          <CogIcon
            className={
              sessionSize === 'short'
                ? 'h-2.5 w-2.5 text-orange-500'
                : 'h-3 w-3 text-orange-500'
            }
          />
        </div>

        {/* Title - takes remaining space */}
        <div className="min-w-0 flex-1">{TitleComponent}</div>

        {/* Duration indicator */}
        <div className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500">
          <ClockIcon
            className={sessionSize === 'short' ? 'h-2.5 w-2.5' : 'h-3 w-3'}
          />
          <span className="tabular-nums">{durationMinutes}m</span>
        </div>
      </div>

      {/* Content below header - only for medium and long sessions */}
      {(sessionSize === 'medium' || sessionSize === 'long') && (
        <div className="mt-1 space-y-1">
          {/* Session type indicator */}
          <div className="flex items-center gap-1 text-xs text-orange-600">
            <span>Service Session</span>
          </div>

          {/* Time range for long sessions */}
          {sessionSize === 'long' && (
            <div className="text-xs text-gray-500">
              {serviceSession.startTime} - {serviceSession.endTime}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
