'use client'

import { api } from '@/lib/trpc/client'
import {
  FeaturedSpeakersManager,
  FeaturedTalksManager,
  ErrorDisplay,
  AdminPageHeader,
} from '@/components/admin'
import { StarIcon } from '@heroicons/react/24/outline'

export default function AdminFeaturedPage() {
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
    <div className="space-y-6">
      <AdminPageHeader
        icon={<StarIcon />}
        title="Featured Content Management"
        description="Manage featured speakers and talks displayed prominently on the website. Featured content appears in Program Highlights sections."
        backLink={{ href: '/admin/marketing', label: 'Back to Marketing' }}
        stats={
          summaryLoading
            ? []
            : summary
              ? [
                  {
                    value: summary.featuredSpeakersCount,
                    label: 'Featured speakers',
                    color: 'green',
                  },
                  {
                    value: summary.featuredTalksCount,
                    label: 'Featured talks',
                    color: 'blue',
                  },
                  {
                    value: summary.availableSpeakersCount,
                    label: 'Available speakers',
                    color: 'blue',
                  },
                  {
                    value: summary.availableTalksCount,
                    label: 'Available talks',
                    color: 'purple',
                  },
                ]
              : []
        }
      >
        {summaryLoading && (
          <div className="font-inter mt-4">
            <div className="animate-pulse">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded bg-gray-200 dark:bg-gray-700"
                  ></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AdminPageHeader>

      {/* Management Sections */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <FeaturedSpeakersManager />

        <FeaturedTalksManager />
      </div>
    </div>
  )
}
