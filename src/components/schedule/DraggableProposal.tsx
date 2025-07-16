'use client'

import { useDraggable } from '@dnd-kit/core'
import { ProposalExisting } from '@/lib/proposal/types'
import { levels, formats } from '@/lib/proposal/types'
import { getProposalDurationMinutes } from '@/lib/schedule/types'
import { ClockIcon, UserIcon } from '@heroicons/react/24/outline'
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
  const isShortTalk = durationMinutes <= 20

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `${dragType}-${proposal._id}-${sourceTimeSlot || 'unassigned'}`,
    data: {
      type: dragType,
      proposal,
      sourceTrackIndex,
      sourceTimeSlot,
    },
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'advanced':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        height: `${durationMinutes * 2.4}px`, // Exact height based on duration (2.4px per minute)
      }}
      className={`relative cursor-grab rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md active:cursor-grabbing ${isDragging ? 'opacity-50' : ''} ${sourceTrackIndex !== undefined ? 'border-l-4 border-l-blue-500' : ''} ${isShortTalk ? 'p-2' : 'p-3'}`}
      {...listeners}
      {...attributes}
    >
      {/* Duration indicator */}
      <div
        className={`absolute top-1 right-1 flex items-center gap-1 text-gray-500 ${isShortTalk ? 'text-xs' : 'text-xs'}`}
      >
        <ClockIcon className={`${isShortTalk ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
        {durationMinutes}m
      </div>

      {/* For short talks (≤20 min), only show title */}
      {isShortTalk ? (
        <>
          {/* Title only - smaller text and reduced line height */}
          <h3 className="line-clamp-2 pr-8 text-xs leading-tight font-medium text-gray-900">
            {proposal.title}
          </h3>
        </>
      ) : (
        <>
          {/* Level badge */}
          <div
            className={`mb-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getLevelColor(proposal.level)}`}
          >
            {levels.get(proposal.level) || proposal.level}
          </div>

          {/* Title */}
          <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">
            {proposal.title}
          </h3>

          {/* Speaker */}
          {proposal.speaker &&
            typeof proposal.speaker === 'object' &&
            'name' in proposal.speaker && (
              <div className="mb-2 flex items-center gap-1 text-xs text-gray-600">
                <UserIcon className="h-3 w-3" />
                <span className="truncate">{proposal.speaker.name}</span>
              </div>
            )}

          {/* Format */}
          <div className="text-xs text-gray-500">
            {formats.get(proposal.format) || proposal.format}
          </div>

          {/* Topics */}
          {proposal.topics && proposal.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
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
  )
}
