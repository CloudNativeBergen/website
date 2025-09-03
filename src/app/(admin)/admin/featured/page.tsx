/**
 * Featured Content Management Admin Page
 * Provides interface for managing featured speakers and talks
 */

'use client'

import { api } from '@/lib/trpc/client'
import {
  FeaturedSpeakersManager,
  FeaturedTalksManager,
  ErrorDisplay,
} from '@/components/admin'
import {
  StarIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function AdminFeaturedPage() {
  // Get summary statistics
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = api.featured.summary.useQuery()

  if (summaryError) {
    return (
      <ErrorDisplay
        title="Error Loading Featured Content"
        message={summaryError.message}
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StarIcon className="h-8 w-8 text-brand-cloud-blue dark:text-indigo-400" />
            <div>
              <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                Featured Content Management
              </h1>
              <p className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                Manage featured speakers and talks displayed prominently on the
                website. Featured content appears in Program Highlights
                sections.
              </p>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        {summaryLoading ? (
          <div className="font-inter mt-4">
            <div className="animate-pulse">
              <div className="grid grid-cols-6 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded bg-gray-200 dark:bg-gray-700"
                  ></div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          summary && (
            <div className="font-inter mt-4 grid grid-cols-6 gap-3">
              <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
                <div className="text-xl font-bold text-brand-fresh-green dark:text-green-400">
                  {summary.featuredSpeakersCount}
                </div>
                <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                  Featured speakers
                </div>
              </div>

              <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
                <div className="text-xl font-bold text-brand-cloud-blue dark:text-indigo-400">
                  {summary.featuredTalksCount}
                </div>
                <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                  Featured talks
                </div>
              </div>

              <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {summary.availableSpeakersCount}
                </div>
                <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                  Available speakers
                </div>
              </div>

              <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {summary.availableTalksCount}
                </div>
                <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                  Available talks
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Management Sections */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Featured Speakers Management */}
        <FeaturedSpeakersManager />

        {/* Featured Talks Management */}
        <FeaturedTalksManager />
      </div>

      {/* Quick Actions */}
      <div className="mt-12">
        <h2 className="mb-6 text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/speakers"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <UsersIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Public Speakers Page
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  See how speakers appear to visitors
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/program"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Public Program Page
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  See how the program appears to visitors
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin"
            className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <StarIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Back to Admin Dashboard
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Return to the main admin interface
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
