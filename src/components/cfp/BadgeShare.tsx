'use client'

import {
  ShieldCheckIcon,
  EyeIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid'
import { BlueskyIcon, LinkedInIcon } from '@/components/SocialIcons'
import {
  shareSocial,
  shareToCredly,
  buildFullUrl,
  addToLinkedInProfile,
} from '@/lib/share/social'
import type { BadgeRecord } from '@/lib/badge/types'
import Link from 'next/link'

interface BadgeShareProps {
  badge: BadgeRecord
  eventName: string
  domain: string
  className?: string
}

export function BadgeShare({
  badge,
  eventName,
  domain,
  className = '',
}: BadgeShareProps) {
  const badgeTypeName = badge.badge_type === 'speaker' ? 'Speaker' : 'Organizer'
  const badgeSvgUrl = badge.baked_svg?.asset?.url
  const badgeUrl = `/badge/${badge.badge_id}`
  const downloadUrl = `/api/badge/${badge.badge_id}/download`
  const jsonUrl = `/api/badge/${badge.badge_id}/json`
  const fullBadgeUrl = buildFullUrl(domain, badgeUrl)
  const fullJsonUrl = buildFullUrl(domain, jsonUrl)

  const handleShare = (platform: 'bluesky') => {
    const text = `🎉 I earned a ${badgeTypeName} Badge at ${eventName}! 🎉`
    shareSocial({ platform, text, url: fullBadgeUrl })
  }

  const handleAddToLinkedIn = () => {
    const issueDate = new Date(badge.issued_at)
    // Extract organization name from badge or use default
    const organizationName =
      typeof badge.conference === 'object' &&
      'organizer' in badge.conference &&
      badge.conference.organizer
        ? badge.conference.organizer
        : 'Cloud Native Bergen'

    addToLinkedInProfile({
      name: `${eventName} ${badgeTypeName} Badge`,
      organizationName,
      issueYear: issueDate.getFullYear(),
      issueMonth: issueDate.getMonth() + 1,
      certUrl: fullBadgeUrl,
      certId: badge.badge_id,
    })
  }

  const handleCredly = () => {
    shareToCredly(fullJsonUrl)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Badge Display */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="bg-linear-to-br from-emerald-600 via-green-600 to-teal-600 p-4 text-center text-white">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <ShieldCheckIcon className="h-4 w-4" />
            <span className="text-xs font-semibold">Badge Earned</span>
          </div>
          <h3 className="font-space-grotesk text-lg font-bold">{eventName}</h3>
          <p className="text-sm opacity-90">{badgeTypeName} Badge</p>
        </div>

        {/* Badge Image */}
        <div className="flex justify-center bg-gray-50 p-8 dark:bg-gray-900">
          {badgeSvgUrl ? (
            <img
              src={badgeSvgUrl}
              alt={`${badgeTypeName} Badge`}
              className="h-48 w-48 drop-shadow-lg"
            />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
              <ShieldCheckIcon className="h-24 w-24 text-gray-400" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 p-4">
          <Link
            href={badgeUrl}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-cloud-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-cloud-blue/90"
          >
            <EyeIcon className="h-4 w-4" />
            View Public Page
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleShare('bluesky')}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <BlueskyIcon className="h-4 w-4" />
              Bluesky
            </button>
            <button
              onClick={handleAddToLinkedIn}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <LinkedInIcon className="h-4 w-4" />
              LinkedIn
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {badgeSvgUrl && (
              <a
                href={downloadUrl}
                download
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Download
              </a>
            )}
            <button
              onClick={handleCredly}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Credly
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
