import { getAuthSession } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/server'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getWorkshopSignupStatisticsBySpeaker } from '@/lib/workshop/sanity'
import { Status } from '@/lib/proposal/types'
import { getSpeakerSlug } from '@/lib/speaker/utils'
import CFPListPageClient from '@/components/cfp/CFPListPageClient'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-red-500 dark:text-red-400">{message}</p>
    </div>
  )
}

export default async function SpeakerDashboard() {
  const session = await getAuthSession()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const {
    conference,
    domain,
    error: conferenceError,
  } = await getConferenceForCurrentDomain()

  if (conferenceError || !conference || !domain) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference" />
  }

  const cfpIsOpen =
    new Date() >= new Date(conference.cfp_start_date) &&
    new Date() <= new Date(conference.cfp_end_date)

  const { proposals: initialProposals, proposalsError } = await getProposals({
    speakerId: session.speaker._id,
    returnAll: false,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals" />
  }

  const speaker = session.speaker
  const eventName = conference.title || 'Cloud Native Bergen'
  const speakerSlug = getSpeakerSlug(speaker)
  const speakerUrl = `https://${domain}/speaker/${speakerSlug}`

  const confirmedProposals = initialProposals.filter((p) => {
    if (p.status !== Status.confirmed) return false

    const proposalConferenceId =
      typeof p.conference === 'object' &&
      p.conference !== null &&
      '_id' in p.conference
        ? p.conference._id
        : p.conference._ref

    return proposalConferenceId === conference._id
  })

  let workshopStats = []
  try {
    workshopStats = await getWorkshopSignupStatisticsBySpeaker(
      session.speaker._id,
      conference._id,
    )
  } catch (error) {
    console.error('Error fetching workshop statistics:', error)
  }

  return (
    <CFPListPageClient
      speaker={speaker}
      confirmedProposals={confirmedProposals}
      initialProposals={initialProposals}
      cfpIsOpen={cfpIsOpen}
      currentConferenceId={conference._id}
      speakerSlug={speakerSlug}
      speakerUrl={speakerUrl}
      eventName={eventName}
      workshopStats={workshopStats}
    />
  )
}
