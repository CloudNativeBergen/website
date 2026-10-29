import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { AdminDashboard } from '@/components/admin/dashboard/AdminDashboard'
import { ActivationHero } from '@/components/admin/ActivationHero'
import { resolveActivationChecklist } from '@/lib/settings/activation-server'
import { isEventHeroWindow } from '@/lib/settings/activation'

import { Suspense } from 'react'

async function DashboardContent() {
  // `topics: true` is load-bearing, not incidental: topics are an OPT-IN join
  // and the boundary normaliser hands back `[]` when they were not projected
  // (see @/lib/conference/sanity). Without it the activation checklist would
  // tell every conference on earth to add its first topic.
  const loaded = await getConferenceForCurrentDomain({ topics: true })
  // From six weeks out until the last day, the hero also covers the event
  // stage. Only then does the dashboard read the schedule (the programme, track
  // sponsor and room rows need it) and opt in to the event facts.
  const eventWindow =
    !!loaded.conference && isEventHeroWindow(loaded.conference)
  const { conference, error } = eventWindow
    ? await getConferenceForCurrentDomain({ topics: true, schedule: true })
    : loaded

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
  const activation = await resolveActivationChecklist(conference, undefined, {
    eventFacts: eventWindow,
  })
  const showEvent =
    eventWindow && activation.event !== null && !activation.event.allDone

  return (
    <>
      {!activation.allDone || showEvent ? (
        <ActivationHero checklist={activation} showEvent={showEvent} />
      ) : null}
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
