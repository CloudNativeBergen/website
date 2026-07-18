'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { TrackTalk } from '@/lib/conference/types'
import type { DragItem } from '@/lib/schedule/types'
import { PIXELS_PER_MINUTE } from '@/lib/schedule/geometry'
import { durationBetween } from '@/lib/schedule/time'
import { ClockIcon, Bars3Icon } from '@heroicons/react/24/outline'

interface DraggableServiceSessionProps {
  serviceSession: TrackTalk
  sourceTrackIndex?: number
  sourceTimeSlot?: string
  isDragging?: boolean
}

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
  const { dragItem, durationMinutes, sessionSize, dragId } = useMemo(() => {
    const duration = durationBetween(
      serviceSession.startTime,
      serviceSession.endTime,
    )

    let size: 'short' | 'medium' | 'long' | 'very-long'
    if (duration <= SERVICE_SESSION_THRESHOLDS.SHORT) size = 'short'
    else if (duration <= SERVICE_SESSION_THRESHOLDS.MEDIUM) size = 'medium'
    else if (duration <= SERVICE_SESSION_THRESHOLDS.LONG) size = 'long'
    else size = 'very-long'

    const session = {
      placeholder: serviceSession.placeholder || 'Service Session',
      startTime: serviceSession.startTime,
      endTime: serviceSession.endTime,
    }
    // A scheduled service is dragged FROM a slot (both source fields are always
    // passed together by ServiceSession); a fresh service carries none.
    const item: DragItem =
      sourceTrackIndex !== undefined && sourceTimeSlot !== undefined
        ? {
            type: 'scheduled-service',
            serviceSession: session,
            sourceTrackIndex,
            sourceTimeSlot,
          }
        : { type: 'service-session', serviceSession: session }
    const id = `${item.type}-${serviceSession.startTime}-${sourceTrackIndex ?? 'unassigned'}-${sourceTimeSlot || 'new'}`

    return {
      dragItem: item,
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
    // The DragOverlay renders this same component (`isDragging`) while the
    // source card is still mounted; suffix the overlay's id so its useDraggable
    // registration can't clobber the source card's in dnd-kit's registry.
    id: isDragging ? `${dragId}-overlay` : dragId,
    data: dragItem,
  })

  const transformStyle = useMemo(() => {
    if (!transform || isBeingDragged) return undefined
    return {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
  }, [transform, isBeingDragged])

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
        height: `${durationMinutes * PIXELS_PER_MINUTE}px`,
      }}
      className={containerClasses}
    >
      <div className="flex min-h-[16px] items-center gap-1">
        {/* Drag handle: dnd-kit's attributes AND listeners live together on
            this real button so the keyboard-focusable element is the one whose
            Enter/Space actually starts the drag. (Keyboard drops remain a
            known gap: `pointerWithin` collision detection has no pointer
            during a keyboard drag.) */}
        <button
          type="button"
          aria-label={`Drag ${serviceSession.placeholder || 'Service Session'}`}
          className="shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-200 dark:hover:bg-gray-600"
          {...attributes}
          {...listeners}
        >
          <Bars3Icon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
        </button>

        <div className="min-w-0 flex-1">{TitleComponent}</div>

        <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
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

      {(sessionSize === 'long' || sessionSize === 'very-long') && (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
            <span>Service Session</span>
          </div>

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
