'use client'

import { useDraggable } from '@dnd-kit/core'
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

export function DraggableProposal({
  proposal,
  sourceTrackIndex,
  sourceTimeSlot,
  isDragging = false,
}: DraggableProposalProps) {
  const dragType =
    sourceTrackIndex !== undefined ? 'scheduled-talk' : 'proposal'
  const durationMinutes = getProposalDurationMinutes(proposal)
  const isVeryShortTalk = durationMinutes <= 10 // 10 min talks
  const isShortTalk = durationMinutes <= 20 // 10-20 min talks
  const isMediumTalk = durationMinutes <= 45 // 25-45 min talks
  // 120+ min talks get full details

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isBeingDragged,
  } = useDraggable({
    id: `${dragType}-${proposal._id}-${sourceTimeSlot || 'unassigned'}`,
    data: {
      type: dragType,
      proposal,
      sourceTrackIndex,
      sourceTimeSlot,
    },
  })

  const style =
    transform && !isBeingDragged
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        }
      : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        height: `${durationMinutes * 2.4}px`, // Exact height based on duration (2.4px per minute)
      }}
      className={`relative max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md ${isBeingDragged ? 'opacity-30' : ''} ${isDragging ? 'opacity-50' : ''} ${sourceTrackIndex !== undefined ? 'border-l-4 border-l-blue-500' : ''} ${isShortTalk ? 'p-1' : 'p-2'}`}
      {...attributes}
    >
      {/* Header row with drag handle, title, and duration */}
      <div className="flex min-h-[16px] items-start gap-1">
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-grab rounded p-0.5 hover:cursor-grabbing hover:bg-gray-100"
          {...listeners}
        >
          <Bars3Icon className="h-3 w-3 text-gray-400" />
        </div>

        {/* Title - takes remaining space */}
        <div className="min-w-0 flex-1">
          {isVeryShortTalk ? (
            <h3 className="line-clamp-1 pr-1 text-xs leading-tight font-medium text-gray-900">
              {proposal.title}
            </h3>
          ) : isShortTalk ? (
            <h3 className="line-clamp-2 pr-1 text-xs leading-tight font-medium text-gray-900">
              {proposal.title}
            </h3>
          ) : (
            <h3 className="line-clamp-2 pr-1 text-sm font-semibold text-gray-900">
              {proposal.title}
            </h3>
          )}
        </div>

        {/* Duration indicator */}
        <div className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500">
          <ClockIcon className={`${isShortTalk ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
          {durationMinutes}m
        </div>
      </div>

      {/* Content below header */}
      {!isVeryShortTalk && !isShortTalk && (
        <div className="mt-1">
          {isMediumTalk ? (
            /* Medium talks (21-45 min): Speaker only */
            <>
              {/* Speaker */}
              {proposal.speaker &&
                typeof proposal.speaker === 'object' &&
                'name' in proposal.speaker && (
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <UserIcon className="h-3 w-3" />
                    <span className="truncate">{proposal.speaker.name}</span>
                  </div>
                )}
            </>
          ) : (
            /* Long talks (46+ min): Full details */
            <>
              {/* Speaker */}
              {proposal.speaker &&
                typeof proposal.speaker === 'object' &&
                'name' in proposal.speaker && (
                  <div className="mb-1 flex items-center gap-1 text-xs text-gray-600">
                    <UserIcon className="h-3 w-3" />
                    <span className="truncate">{proposal.speaker.name}</span>
                  </div>
                )}

              {/* Format */}
              <div className="mb-1 text-xs text-gray-500">
                {formats.get(proposal.format) || proposal.format}
              </div>

              {/* Topics */}
              {proposal.topics && proposal.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {proposal.topics.slice(0, 2).map((topic, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                    >
                      {typeof topic === 'object' && 'title' in topic
                        ? topic.title
                        : 'Topic'}
                    </span>
                  ))}
                  {proposal.topics.length > 2 && (
                    <span className="text-xs text-gray-400">
                      +{proposal.topics.length - 2} more
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
