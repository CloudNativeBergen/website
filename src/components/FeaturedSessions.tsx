import Link from 'next/link'
import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { Container } from '@/components/Container'
import { TalkPromotionCard } from '@/components/TalkPromotionCard'

// Select a curated list of sessions (talks + workshops) for the front page.
// Prioritise workshops, then longer presentations, then remaining talks by start time.
function selectFeaturedTalks(
  schedules: ConferenceSchedule[],
  max = 6,
): TrackTalk[] {
  const talks: TrackTalk[] = []
  schedules.forEach((schedule) => {
    schedule.tracks.forEach((t) => {
      t.talks.forEach((slot) => {
        if (slot.talk) talks.push(slot)
      })
    })
  })

  function score(tt: TrackTalk) {
    const f = tt.talk?.format || ''
    if (f.startsWith('workshop')) return 100
    if (f === 'presentation_45' || f === 'presentation_40') return 80
    if (f === 'presentation_25') return 60
    if (f === 'presentation_20') return 50
    if (f === 'lightning_10') return 30
    return 10
  }

  const sorted = talks.sort((a, b) => {
    const s = score(b) - score(a)
    if (s !== 0) return s
    return a.startTime.localeCompare(b.startTime)
  })

  return sorted.slice(0, max)
}

interface FeaturedSessionsProps {
  schedules?: ConferenceSchedule[] | null
}

export function FeaturedSessions({ schedules }: FeaturedSessionsProps) {
  if (!schedules || schedules.length === 0) return null

  const featured = selectFeaturedTalks(schedules)
  if (featured.length === 0) return null

  return (
    <section
      id="featured-sessions"
      aria-labelledby="featured-sessions-title"
      className="py-20 sm:py-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
          <h2
            id="featured-sessions-title"
            className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl"
          >
            Featured Sessions
          </h2>
          <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray">
            A quick taste of the cloud-native content waiting for you. Explore
            workshops &amp; talks from experts shaping the ecosystem.
          </p>
        </div>

        <div className="mt-14 grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((slot) => {
            const proposal = slot.talk!
            return (
              <TalkPromotionCard
                key={`${slot.startTime}-${proposal._id}`}
                talk={proposal}
                slot={{ time: `${slot.startTime} – ${slot.endTime}` }}
                variant="default"
                ctaText="View Full Program"
                ctaUrl="/program"
              />
            )
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/program"
            className="font-inter inline-flex items-center rounded-xl bg-brand-cloud-blue px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-cloud-blue/90"
          >
            Explore the full program
          </Link>
        </div>
      </Container>
    </section>
  )
}
