'use client'

import {
  UserGroupIcon,
  PlusCircleIcon,
  PencilIcon,
  MegaphoneIcon,
  ExclamationTriangleIcon,
  EnvelopeIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import { getWorkshopDuration } from '@/lib/workshop/utils'
import { isCanceledWorkshop } from '@/lib/workshop/listed'
import { calculateWorkshopStats, getCapacityColorClass } from './utils'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTimeSafe } from '@/lib/time'

interface WorkshopCardProps {
  workshop: ProposalWithWorkshopData
  confirmedCount: number
  waitlistCount: number
  onViewConfirmed: () => void
  onViewWaitlist: () => void
  onAddParticipant: () => void
  onEditCapacity: () => void
  onAnnounce: () => void
  /** A canceled workshop's "Notify participants". */
  onNotifyCanceled?: () => void
  /** A canceled workshop's "Move participants". */
  onMoveParticipants?: () => void
  /** One below the heading the card sits under. */
  titleLevel?: 3 | 4
}

export function WorkshopCard({
  workshop,
  confirmedCount,
  waitlistCount,
  onViewConfirmed,
  onViewWaitlist,
  onAddParticipant,
  onEditCapacity,
  onAnnounce,
  onNotifyCanceled,
  onMoveParticipants,
  titleLevel = 3,
}: WorkshopCardProps) {
  const Title = `h${titleLevel}` as const
  const { capacityPercentage, utilizationPercentage, overCapacityBy } =
    calculateWorkshopStats(workshop, confirmedCount, waitlistCount)
  const overCapacity = overCapacityBy > 0
  // Not listed and taking no sign-ups; the ones it had are still here.
  const canceled = isCanceledWorkshop(workshop)
  // One decision drives both what the bar's fill says and what it looks like,
  // so a test can read the former without asserting a class name (#1361).
  const fill = overCapacity
    ? { over: true, color: 'bg-red-500' }
    : { over: false, color: getCapacityColorClass(capacityPercentage) }

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 min-h-12">
          <Title className="line-clamp-2 text-base leading-tight font-semibold text-gray-900 dark:text-white">
            {workshop.title}
          </Title>
          {canceled && (
            <StatusBadge
              label={workshop.status === 'withdrawn' ? 'Withdrawn' : 'Canceled'}
              color="gray"
              className="mt-1"
            />
          )}
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
              <span>({utilizationPercentage}%)</span>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Capacity used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={capacityPercentage}
            aria-valuetext={`${utilizationPercentage}%`}
            className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              data-over-capacity={fill.over ? '' : undefined}
              className={`h-full transition-all ${fill.color}`}
              style={{ width: `${capacityPercentage}%` }}
            />
          </div>
          {overCapacity && (
            <StatusBadge
              label={`Over capacity by ${overCapacityBy}`}
              color="red"
              icon={ExclamationTriangleIcon}
              className="mt-2"
            />
          )}
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

      {canceled ? (
        <div className="flex flex-col gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
          {workshop.workshopCancelNoticeSentAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Participants notified{' '}
              {formatDateTimeSafe(workshop.workshopCancelNoticeSentAt)}
            </p>
          )}
          <AdminButton
            variant="secondary"
            onClick={onNotifyCanceled}
            className="w-full"
            disabled={confirmedCount + waitlistCount === 0}
          >
            <EnvelopeIcon className="h-4 w-4" />
            Notify participants
          </AdminButton>
          <AdminButton
            variant="secondary"
            onClick={onMoveParticipants}
            className="w-full"
            disabled={confirmedCount + waitlistCount === 0}
          >
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Move participants
          </AdminButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="flex gap-2">
            <AdminButton
              variant="secondary"
              onClick={onEditCapacity}
              title="Edit capacity"
            >
              <PencilIcon className="h-4 w-4" />
              Capacity
            </AdminButton>
            <AdminButton
              color="blue"
              onClick={onAddParticipant}
              className="flex-1"
            >
              <PlusCircleIcon className="h-4 w-4" />
              Add Participant
            </AdminButton>
          </div>
          <AdminButton
            variant="secondary"
            onClick={onAnnounce}
            className="w-full"
            title="Announce to confirmed participants"
          >
            <MegaphoneIcon className="h-4 w-4" />
            Announce to participants
          </AdminButton>
        </div>
      )}
    </div>
  )
}
