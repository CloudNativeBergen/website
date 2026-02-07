'use client'

import { TravelSupportAdminPage } from '@/components/travel-support/TravelSupportAdminPage'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function AdminTravelSupportPage() {
  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/speakers"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Speakers
        </Link>
      </div>
      <TravelSupportAdminPage />
    </>
  )
}
