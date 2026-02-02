'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  PhotoIcon,
  ClockIcon,
  CheckCircleIcon,
  FolderIcon,
} from '@heroicons/react/24/outline'
import {
  getGalleryManagementData,
  type GalleryManagementData,
} from '@/hooks/dashboard/useDashboardData'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'

type GalleryManagementWidgetProps = BaseWidgetProps

export function GalleryManagementWidget({
  conference,
}: GalleryManagementWidgetProps) {
  const phase = conference ? getCurrentPhase(conference) : null
  const [data, setData] = useState<GalleryManagementData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getGalleryManagementData().then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  // Phase-specific: Initialization/Planning - Show preparation message
  if (phase === 'initialization' || phase === 'planning') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <FolderIcon className="mb-3 h-12 w-12 text-gray-400" />
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Gallery Not Active
        </h3>
        <p className="text-center text-xs text-gray-600 dark:text-gray-400">
          Photo uploads become available during conference execution.
        </p>
      </div>
    )
  }

  // Phase-specific: Post-conference - Show final summary
  if (phase === 'post-conference' && data) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Gallery Management
          </h3>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            Archived
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <CheckCircleIcon className="mb-2 h-6 w-6 text-blue-500" />
            <div className="text-[10px] font-medium text-blue-600 uppercase dark:text-blue-400">
              Total Photos
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-900 dark:text-blue-100">
              {data.totalPhotos}
            </div>
          </div>

          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
            <div className="text-[10px] font-medium text-green-600 uppercase dark:text-green-400">
              Published
            </div>
            <div className="mt-1 text-3xl font-bold text-green-900 dark:text-green-100">
              {data.publishedPhotos}
            </div>
          </div>

          <div className="col-span-2 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
            <div className="text-[10px] font-medium text-purple-600 uppercase dark:text-purple-400">
              Contributor Count
            </div>
            <div className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
              {data.contributors}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No gallery data available
        </p>
      </div>
    )
  }

  // Default operational view (execution phase)
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Gallery Management
        </h3>
        <Link
          href="/admin/gallery"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      {data.pendingReview > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-center dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Pending Review
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100">
            {data.pendingReview}
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
          <PhotoIcon className="mb-1 h-5 w-5 text-blue-500" />
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Total
          </div>
          <div className="mt-0.5 text-lg font-bold text-blue-900 dark:text-blue-100">
            {data.totalPhotos}
          </div>
        </div>
        <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
          <CheckCircleIcon className="mb-1 h-5 w-5 text-green-500" />
          <div className="text-[11px] text-green-600 dark:text-green-400">
            Published
          </div>
          <div className="mt-0.5 text-lg font-bold text-green-900 dark:text-green-100">
            {data.publishedPhotos}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <h4 className="mb-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          Recent Uploads
        </h4>
        <div className="space-y-2">
          {data.recentUploads.slice(0, 3).map((upload) => (
            <div
              key={upload.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-0.5 flex items-start justify-between">
                <span className="text-[11px] leading-tight font-semibold text-gray-900 dark:text-gray-100">
                  {upload.count} photos
                </span>
                <ClockIcon className="h-3 w-3 text-gray-400" />
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                {upload.timestamp}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
