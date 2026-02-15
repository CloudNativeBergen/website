import Link from 'next/link'
import { formatDatesSafe } from '@/lib/time'
import type { ConferenceWithSpeakerData } from '@/lib/dashboard/types'
import {
  CalendarIcon,
  MapPinIcon,
  PhotoIcon,
  DocumentTextIcon,
  LockClosedIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'

interface CompactConferenceHeaderProps {
  data: ConferenceWithSpeakerData
}

export function CompactConferenceHeader({
  data,
}: CompactConferenceHeaderProps) {
  const { conference, proposals, galleryImages, workshopStats, isOver } = data
  const domain = conference.domains?.[0] || 'cloudnativedays.no'

  return (
    <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-space-grotesk truncate text-base font-bold text-gray-900 dark:text-white">
            {conference.title}
          </h3>
          {isOver && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              <LockClosedIcon className="h-3 w-3" />
              Past
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            <time dateTime={conference.startDate}>
              {formatDatesSafe(conference.startDate, conference.endDate)}
            </time>
          </div>
          <div className="flex items-center gap-1">
            <MapPinIcon className="h-3.5 w-3.5" />
            <span>
              {conference.city}, {conference.country}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {proposals.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <DocumentTextIcon className="h-4 w-4" />
            <span className="font-medium">{proposals.length}</span>
          </div>
        )}
        {workshopStats.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <AcademicCapIcon className="h-4 w-4" />
            <span className="font-medium">{workshopStats.length}</span>
          </div>
        )}
        {galleryImages.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <PhotoIcon className="h-4 w-4" />
            <span className="font-medium">{galleryImages.length}</span>
          </div>
        )}
        <Link
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
          onClick={(e) => e.stopPropagation()}
        >
          View →
        </Link>
      </div>
    </div>
  )
}
