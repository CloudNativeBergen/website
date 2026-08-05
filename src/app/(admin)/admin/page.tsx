import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { AdminDashboard } from '@/components/admin/dashboard/AdminDashboard'
import { ActivationHero } from '@/components/admin/ActivationHero'
import { resolveActivationChecklist } from '@/lib/settings/activation-server'

import { Suspense } from 'react'

async function DashboardContent() {
  // `topics: true` is load-bearing, not incidental: topics are an OPT-IN join
  // and the boundary normaliser hands back `[]` when they were not projected
  // (see @/lib/conference/sanity). Without it the activation checklist would
  // tell every conference on earth to add its first topic.
  const { conference, error } = await getConferenceForCurrentDomain({
    topics: true,
  })

  if (error || !conference) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Could not load conference data.
        </p>
      </div>
    )
  }

  // THE ACTIVATION HERO (#839). A new organizer lands here, not on
  // /admin/settings, so this is where "what do I do next?" has to be answered.
  // It renders only while a required row is outstanding; a fully activated
  // conference sees the widget grid alone, exactly as before.
  const activation = await resolveActivationChecklist(conference)

  return (
    <>
      {activation.allDone ? null : <ActivationHero checklist={activation} />}
      <AdminDashboard conference={conference} />
    </>
  )
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
