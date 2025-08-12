'use client'

import { useDroppable } from '@dnd-kit/core'
import { ConferenceSponsorDetailed, SponsorStatus } from '@/lib/sponsor/types'
import SponsorCard from './SponsorCard'

interface ColumnDefinition {
  id: string
  title: string
  description: string
  color: string
  headerColor: string
  statuses: readonly SponsorStatus[]
}

interface SponsorColumnProps {
  column: ColumnDefinition
  sponsors: ConferenceSponsorDetailed[]
  sponsorCount: number
}

export default function SponsorColumn({
  column,
  sponsors,
  sponsorCount,
}: SponsorColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  return (
    <div className="flex h-full w-72 min-w-72 flex-col max-h-full">
      {/* Column Header */}
      <div
        className={`${column.headerColor} rounded-t-lg border-2 border-b-0 ${column.color.split(' ')[1]} p-3 flex-shrink-0`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{column.title}</h2>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-700">
            {sponsorCount}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600">{column.description}</p>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={`flex-1 ${column.color} rounded-b-lg border-2 border-t-0 p-3 transition-colors duration-200 overflow-hidden min-h-0 ${isOver ? 'bg-opacity-75 border-dashed' : ''} `}
      >
        <div className="flex flex-col gap-3 overflow-hidden">
          {sponsors.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm text-gray-400">
                  {column.id === 'unassigned'
                    ? 'No unassigned sponsors'
                    : `No sponsors in ${column.title.toLowerCase()}`}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Drag sponsors here to update their status
                </div>
              </div>
            </div>
          ) : (
            sponsors.map((sponsor) => (
              <SponsorCard key={sponsor.sponsor._id} sponsor={sponsor} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
