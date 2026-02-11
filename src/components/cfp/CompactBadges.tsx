'use client'

import { useState } from 'react'
import {
  ShieldCheckIcon,
  ArrowDownTrayIcon,
  ClipboardIcon,
  CheckIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import type { BadgeRecord } from '@/lib/badge/types'

interface CompactBadgesProps {
  badges: BadgeRecord[]
}

export function CompactBadges({ badges }: CompactBadgesProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (badges.length === 0) {
    return null
  }

  const handleCopyUrl = async (badge: BadgeRecord) => {
    if (!badge.verificationUrl) return

    try {
      await navigator.clipboard.writeText(badge.verificationUrl)
      setCopiedId(badge._id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy URL:', error)
    }
  }

  const handleDownload = (badge: BadgeRecord) => {
    const svgUrl = badge.bakedSvg?.asset?.url
    if (!svgUrl) return

    const link = document.createElement('a')
    link.href = svgUrl
    link.download = `badge-${badge.badgeType}-${badge.badgeId}.svg`
    link.click()
  }

  return (
    <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-700/50">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
          Badges Earned
        </h4>
      </div>

      <div className="space-y-2">
        {badges.map((badge) => {
          const badgeTypeName =
            badge.badgeType === 'speaker' ? 'Speaker' : 'Organizer'
          const issuedDate = new Date(badge.issuedAt).toLocaleDateString(
            'en-US',
            {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            },
          )

          return (
            <div
              key={badge._id}
              className="flex items-center justify-between rounded border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-gray-800"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {badgeTypeName} Badge
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Issued {issuedDate}
                </p>
              </div>

              <div className="flex gap-1">
                <Link
                  href={`/badge/${badge.badgeId}`}
                  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  title="View badge"
                >
                  <EyeIcon className="h-4 w-4" />
                </Link>

                <button
                  onClick={() => handleDownload(badge)}
                  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  title="Download badge"
                  disabled={!badge.bakedSvg?.asset?.url}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>

                <button
                  onClick={() => handleCopyUrl(badge)}
                  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  title="Copy verification URL"
                  disabled={!badge.verificationUrl}
                >
                  {copiedId === badge._id ? (
                    <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <ClipboardIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
