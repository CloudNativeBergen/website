'use client'

import {
  UserGroupIcon,
  PlusCircleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { getWorkshopDuration } from '@/lib/workshop/utils'
import { calculateWorkshopStats, getCapacityColorClass } from './utils'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { AdminButton } from '@/components/admin/AdminButton'

interface WorkshopCardProps {
  workshop: ProposalWithWorkshopData
  confirmedCount: number
  waitlistCount: number
  onViewConfirmed: () => void
  onViewWaitlist: () => void
  onAddParticipant: () => void
  onEditCapacity: () => void
}

export function WorkshopCard({
  workshop,
  confirmedCount,
  waitlistCount,
  onViewConfirmed,
  onViewWaitlist,
  onAddParticipant,
  onEditCapacity,
}: WorkshopCardProps) {
  const { capacityPercentage } = calculateWorkshopStats(
    workshop,
    confirmedCount,
    waitlistCount,
  )

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 min-h-12">
          <h3 className="line-clamp-2 text-base leading-tight font-semibold text-gray-900 dark:text-white">
            {workshop.title}
          </h3>
        </div>

        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {getWorkshopDuration(workshop.format)}
        </p>

        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Capacity</span>
            <div className="flex items-center gap-1">
              <UserGroupIcon className="h-3.5 w-3.5" />
              <span className="font-medium">
                {confirmedCount}/{workshop.capacity}
              </span>
              <span>({capacityPercentage.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full transition-all ${getCapacityColorClass(capacityPercentage)}`}
              style={{ width: `${Math.min(capacityPercentage, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onViewConfirmed}
            className="flex items-center justify-between rounded-lg bg-green-50 px-2.5 py-2 text-xs text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
          >
            <span className="font-medium">Confirmed</span>
            <span className="font-semibold">{confirmedCount}</span>
          </button>
          <button
            onClick={onViewWaitlist}
            className="flex items-center justify-between rounded-lg bg-blue-50 px-2.5 py-2 text-xs text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
          >
            <span className="font-medium">Waitlist</span>
            <span className="font-semibold">{waitlistCount}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
        <AdminButton
          variant="secondary"
          onClick={onEditCapacity}
          title="Edit capacity"
        >
          <PencilIcon className="h-4 w-4" />
          Capacity
        </AdminButton>
        <AdminButton color="blue" onClick={onAddParticipant} className="flex-1">
          <PlusCircleIcon className="h-4 w-4" />
          Add Participant
        </AdminButton>
      </div>
    </div>
  )
}
