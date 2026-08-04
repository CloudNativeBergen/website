import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { AdminDashboard } from '@/components/admin/dashboard/AdminDashboard'

import { Suspense } from 'react'

async function DashboardContent() {
  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error || !conference) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Could not load conference data.
        </p>
      </div>
    )
  }

  return <AdminDashboard conference={conference} />
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
