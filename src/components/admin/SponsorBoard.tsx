'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  ConferenceSponsorDetailed,
  SponsorStatus,
  SPONSOR_STATUS_CATEGORIES,
} from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import SponsorCard from './SponsorCard'
import SponsorColumn from './SponsorColumn'

interface SponsorBoardProps {
  sponsors: ConferenceSponsorDetailed[]
  conference: Conference
}

// Define the columns based on sponsor status categories
const BOARD_COLUMNS = [
  {
    id: 'prospect' as const,
    title: 'Prospects',
    description: 'Potential sponsors and initial contacts',
    color: 'bg-blue-50 border-blue-200',
    headerColor: 'bg-blue-100',
    statuses: SPONSOR_STATUS_CATEGORIES.prospect as readonly SponsorStatus[],
  },
  {
    id: 'negotiation' as const,
    title: 'Negotiation',
    description: 'Active discussions and proposals',
    color: 'bg-yellow-50 border-yellow-200',
    headerColor: 'bg-yellow-100',
    statuses: SPONSOR_STATUS_CATEGORIES.negotiation as readonly SponsorStatus[],
  },
  {
    id: 'contract' as const,
    title: 'Contract',
    description: 'Contract phase and confirmation',
    color: 'bg-purple-50 border-purple-200',
    headerColor: 'bg-purple-100',
    statuses: SPONSOR_STATUS_CATEGORIES.contract as readonly SponsorStatus[],
  },
  {
    id: 'financial' as const,
    title: 'Financial',
    description: 'Invoicing and payment tracking',
    color: 'bg-green-50 border-green-200',
    headerColor: 'bg-green-100',
    statuses: SPONSOR_STATUS_CATEGORIES.financial as readonly SponsorStatus[],
  },
  {
    id: 'fulfillment' as const,
    title: 'Fulfillment',
    description: 'Delivery and completion',
    color: 'bg-gray-50 border-gray-200',
    headerColor: 'bg-gray-100',
    statuses: SPONSOR_STATUS_CATEGORIES.fulfillment as readonly SponsorStatus[],
  },
] as const

export default function SponsorBoard({
  sponsors,
  conference,
}: SponsorBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sponsorItems, setSponsorItems] = useState(sponsors)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  // Get sponsors for a specific column
  const getSponsorsForColumn = (columnId: string) => {
    const column = BOARD_COLUMNS.find((col) => col.id === columnId)
    if (!column) return []

    return sponsorItems.filter((sponsor) => {
      const currentStatus = sponsor.sponsor.relationship?.current_status
      return currentStatus && column.statuses.includes(currentStatus)
    })
  }

  // Get sponsors without status (unassigned)
  const getUnassignedSponsors = () => {
    return sponsorItems.filter((sponsor) => {
      const currentStatus = sponsor.sponsor.relationship?.current_status
      return (
        !currentStatus ||
        !Object.values(SPONSOR_STATUS_CATEGORIES).flat().includes(currentStatus)
      )
    })
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find the active sponsor
    const activeSponsor = sponsorItems.find((s) => s.sponsor._id === activeId)
    if (!activeSponsor) return

    // Determine the target column
    let targetColumn = BOARD_COLUMNS.find((col) => col.id === overId)

    // If dropping on another sponsor, find which column that sponsor is in
    if (!targetColumn) {
      const targetSponsor = sponsorItems.find((s) => s.sponsor._id === overId)
      if (targetSponsor) {
        const targetStatus = targetSponsor.sponsor.relationship?.current_status
        targetColumn = BOARD_COLUMNS.find(
          (col) => targetStatus && col.statuses.includes(targetStatus),
        )
      }
    }

    if (!targetColumn) return

    // Update the sponsor's status to the first status of the target column
    const newStatus = targetColumn.statuses[0] as SponsorStatus
    const currentStatus = activeSponsor.sponsor.relationship?.current_status

    if (currentStatus !== newStatus) {
      // Update local state immediately for optimistic UI
      setSponsorItems((prev) =>
        prev.map((sponsor) =>
          sponsor.sponsor._id === activeId
            ? {
                ...sponsor,
                sponsor: {
                  ...sponsor.sponsor,
                  relationship: {
                    ...sponsor.sponsor.relationship,
                    current_status: newStatus,
                    status_updated: new Date().toISOString(),
                  } as any,
                },
              }
            : sponsor,
        ),
      )

      // TODO: Implement status change with tRPC mutation
      // This would call a tRPC mutation to update the sponsor status in the backend
      console.log('Status change:', { sponsorId: activeId, newStatus })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)

    const { active, over } = event

    if (!over) return

    // Handle sorting within the same column
    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    // Find both sponsors
    const activeSponsor = sponsorItems.find((s) => s.sponsor._id === activeId)
    const overSponsor = sponsorItems.find((s) => s.sponsor._id === overId)

    if (!activeSponsor || !overSponsor) return

    // Check if they're in the same column
    const activeStatus = activeSponsor.sponsor.relationship?.current_status
    const overStatus = overSponsor.sponsor.relationship?.current_status

    const activeColumn = BOARD_COLUMNS.find(
      (col) => activeStatus && col.statuses.includes(activeStatus),
    )
    const overColumn = BOARD_COLUMNS.find(
      (col) => overStatus && col.statuses.includes(overStatus),
    )

    if (activeColumn && overColumn && activeColumn.id === overColumn.id) {
      // Reorder within the same column
      const columnSponsors = getSponsorsForColumn(activeColumn.id)
      const activeIndex = columnSponsors.findIndex(
        (s) => s.sponsor._id === activeId,
      )
      const overIndex = columnSponsors.findIndex(
        (s) => s.sponsor._id === overId,
      )

      if (activeIndex !== overIndex) {
        const newOrder = arrayMove(columnSponsors, activeIndex, overIndex)

        // Update the full sponsor list with the new order
        setSponsorItems((prev) => {
          const otherSponsors = prev.filter(
            (s) =>
              !columnSponsors.some((cs) => cs.sponsor._id === s.sponsor._id),
          )
          return [...otherSponsors, ...newOrder]
        })
      }
    }
  }

  const activeSponsor = activeId
    ? sponsorItems.find((s) => s.sponsor._id === activeId)
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
        {/* Board Columns */}
        <div className="flex flex-1 gap-6 overflow-x-auto overflow-y-hidden min-h-0">
          {/* Unassigned Sponsors Column */}
          {getUnassignedSponsors().length > 0 && (
            <SortableContext
              items={getUnassignedSponsors().map((s) => s.sponsor._id)}
              strategy={verticalListSortingStrategy}
            >
              <SponsorColumn
                column={{
                  id: 'unassigned',
                  title: 'Unassigned',
                  description: 'Sponsors without status',
                  color: 'bg-red-50 border-red-200',
                  headerColor: 'bg-red-100',
                  statuses: [],
                }}
                sponsors={getUnassignedSponsors()}
                sponsorCount={getUnassignedSponsors().length}
              />
            </SortableContext>
          )}

          {BOARD_COLUMNS.map((column) => {
            const columnSponsors = getSponsorsForColumn(column.id)

            return (
              <SortableContext
                key={column.id}
                items={columnSponsors.map((s) => s.sponsor._id)}
                strategy={verticalListSortingStrategy}
              >
                <SponsorColumn
                  column={column}
                  sponsors={columnSponsors}
                  sponsorCount={columnSponsors.length}
                />
              </SortableContext>
            )
          })}
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeSponsor && (
          <SponsorCard sponsor={activeSponsor} isDragging={true} />
        )}
      </DragOverlay>
    </DndContext>
  )
}
