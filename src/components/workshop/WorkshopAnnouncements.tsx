'use client'

import { MegaphoneIcon } from '@heroicons/react/24/outline'
import { formatRelativeTime } from '@/lib/time'
import type { WorkshopAnnouncementView } from '@/lib/workshop/announcements'

interface WorkshopAnnouncementsProps {
  announcements: WorkshopAnnouncementView[]
}

/**
 * Presentational 'Announcements' block shown to workshop participants inside the
 * workshop card. One-way broadcasts from the owner/organizer, newest first, with
 * author + relative time. Plain text is rendered with `whitespace-pre-wrap` so
 * the author's line breaks survive. Renders nothing when there are no
 * announcements (keeps the card clean for workshops that never broadcast).
 */
export default function WorkshopAnnouncements({
  announcements,
}: WorkshopAnnouncementsProps) {
  if (announcements.length === 0) return null

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      <h4 className="font-space-grotesk mb-3 flex items-center gap-2 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
        <MegaphoneIcon className="h-4 w-4 text-brand-cloud-blue dark:text-blue-400" />
        Announcements
      </h4>
      <ul className="space-y-3">
        {announcements.map((announcement) => (
          <li
            key={announcement._id}
            className="rounded-lg bg-brand-sky-mist/60 p-3 dark:bg-gray-700/40"
          >
            <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-200">
              {announcement.body}
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {announcement.authorName || 'Workshop organizer'}
              {' · '}
              {formatRelativeTime(announcement.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
