import Link from 'next/link'
import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { SpeakerWithTalks, Flags } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { Container } from '@/components/Container'
import { TalkPromotionCard } from '@/components/TalkPromotionCard'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { Button } from '@/components/Button'
import { CallToAction } from '@/components/CallToAction'
import {
  UserGroupIcon,
  PresentationChartBarIcon,
  ClockIcon,
  CalendarDaysIcon,
  TicketIcon,
  MicrophoneIcon,
  RocketLaunchIcon,
  MapPinIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { StarIcon, SparklesIcon } from '@heroicons/react/24/solid'

/**
 * Calculate a stable daily rotation index using modulus arithmetic
 * This ensures the same content is shown for the entire day across all timezones
 */
function getDailyRotationIndex(arrayLength: number): number {
  if (arrayLength === 0) return 0

  // Use UTC date to ensure consistency across different deployments/timezones
  const now = new Date()
  const utcDate = new Date(now.getTime() + now.getTimezoneOffset() * 60000)

  // Calculate days since epoch (Jan 1, 2024) for consistent rotation
  const epoch = new Date('2024-01-01T00:00:00.000Z')
  const daysSinceEpoch = Math.floor(
    (utcDate.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24),
  )

  // Use modulus to cycle through the array
  return daysSinceEpoch % arrayLength
}

// Extract unique speakers from schedules
function extractSpeakersFromSchedules(
  schedules: ConferenceSchedule[],
): SpeakerWithTalks[] {
  const speakersMap = new Map<string, SpeakerWithTalks>()

  schedules.forEach((schedule) => {
    schedule.tracks.forEach((track) => {
      track.talks.forEach((slot) => {
        // Only include talks that exist, are confirmed, and have speakers
        if (slot.talk?.speakers && slot.talk.status === 'confirmed') {
          slot.talk.speakers.forEach((speaker) => {
            if (speaker && typeof speaker === 'object' && '_id' in speaker) {
              const speakerId = speaker._id
              const existingSpeaker = speakersMap.get(speakerId)

              if (existingSpeaker) {
                // Add this talk to existing speaker
                if (!existingSpeaker.talks) existingSpeaker.talks = []
                existingSpeaker.talks.push(slot.talk!)
              } else {
                // Create new speaker entry with their talk
                speakersMap.set(speakerId, {
                  ...speaker,
                  talks: [slot.talk!],
                } as SpeakerWithTalks)
              }
            }
          })
        }
      })
    })
  })

  return Array.from(speakersMap.values())
}

// Enhanced selection logic for featured talks
function selectFeaturedTalks(
  schedules: ConferenceSchedule[],
  featuredTalkIds: string[] = [],
  maxRegular = 6,
  usedTalkIds: Set<string> = new Set(),
): { featured: TrackTalk[]; regular: TrackTalk[]; usedTalkIds: Set<string> } {
  const talks: TrackTalk[] = []
  schedules.forEach((schedule) => {
    schedule.tracks.forEach((t) => {
      t.talks.forEach((slot) => {
        // Only include talks that exist, are confirmed, have proper data, and haven't been used
        if (
          slot.talk &&
          slot.talk.status === 'confirmed' &&
          !usedTalkIds.has(slot.talk._id)
        ) {
          talks.push(slot)
        }
      })
    })
  })

  // Separate featured talks from regular talks
  const featured: TrackTalk[] = []
  const remaining: TrackTalk[] = []

  talks.forEach((talk) => {
    if (talk.talk && featuredTalkIds.includes(talk.talk._id)) {
      featured.push(talk)
    } else {
      remaining.push(talk)
    }
  })

  function score(tt: TrackTalk) {
    const f = tt.talk?.format || ''
    const hasMultipleSpeakers = (tt.talk?.speakers?.length || 0) > 1
    const isWorkshop = f.startsWith('workshop')
    const isLongTalk = f === 'presentation_45' || f === 'presentation_40'

    let score = 0
    if (isWorkshop) score += 100
    if (isLongTalk) score += 80
    if (hasMultipleSpeakers) score += 20
    if (f === 'presentation_25') score += 60
    if (f === 'presentation_20') score += 50
    if (f === 'lightning_10') score += 30

    return score
  }

  // Sort remaining talks by score and take the best ones
  const sortedRemaining = remaining.sort((a, b) => {
    const s = score(b) - score(a)
    if (s !== 0) return s
    return a.startTime.localeCompare(b.startTime)
  })

  // Track used talk IDs
  const newUsedTalkIds = new Set(usedTalkIds)

  // If no featured talks are explicitly provided, select the highest scored talk as featured
  if (featuredTalkIds.length === 0 && sortedRemaining.length > 0) {
    featured.push(sortedRemaining[0])
    if (sortedRemaining[0].talk) {
      newUsedTalkIds.add(sortedRemaining[0].talk._id)
    }
    const regular = sortedRemaining.slice(1, maxRegular + 1) // Take one extra since we used the first as featured
    regular.forEach((talk) => {
      if (talk.talk) {
        newUsedTalkIds.add(talk.talk._id)
      }
    })
    return { featured, regular, usedTalkIds: newUsedTalkIds }
  }

  // Add featured talks to used set
  featured.forEach((talk) => {
    if (talk.talk) {
      newUsedTalkIds.add(talk.talk._id)
    }
  })

  const regular = sortedRemaining.slice(0, maxRegular)
  regular.forEach((talk) => {
    if (talk.talk) {
      newUsedTalkIds.add(talk.talk._id)
    }
  })

  return { featured, regular, usedTalkIds: newUsedTalkIds }
}

// Enhanced speaker selection that considers talks and prevents duplicates
function selectFeaturedSpeakers(
  speakers: SpeakerWithTalks[],
  featuredSpeakerIds: string[] = [],
  maxRegular = 6,
  usedSpeakerIds: Set<string> = new Set(),
  usedTalkIds: Set<string> = new Set(),
): {
  featured: SpeakerWithTalks[]
  regular: SpeakerWithTalks[]
  usedSpeakerIds: Set<string>
} {
  if (speakers.length === 0) {
    return {
      featured: [],
      regular: [],
      usedSpeakerIds: new Set(usedSpeakerIds),
    }
  }

  // Filter out speakers who are already used or whose talks are already featured
  const availableSpeakers = speakers.filter((speaker) => {
    // Skip if speaker is already used
    if (usedSpeakerIds.has(speaker._id)) {
      return false
    }

    // Skip if any of this speaker's talks are already featured
    if (speaker.talks?.some((talk) => usedTalkIds.has(talk._id))) {
      return false
    }

    return true
  })

  // Separate featured speakers from regular speakers
  const featured: SpeakerWithTalks[] = []
  const remaining: SpeakerWithTalks[] = []

  availableSpeakers.forEach((speaker) => {
    if (featuredSpeakerIds.includes(speaker._id)) {
      featured.push(speaker)
    } else {
      remaining.push(speaker)
    }
  })

  // Score remaining speakers based on their talks and profile
  const scoredSpeakers = remaining.map((speaker) => {
    let score = 0
    const talkCount = speaker.talks?.length || 0

    // More talks = higher score
    score += talkCount * 10

    // Bonus for workshops or long presentations
    speaker.talks?.forEach((talk) => {
      if (talk.format?.startsWith('workshop')) score += 50
      if (
        talk.format === 'presentation_45' ||
        talk.format === 'presentation_40'
      )
        score += 30
    })

    // Bonus for having bio
    if (speaker.bio) score += 20

    // Bonus for having company in title
    if (speaker.title?.includes('@') || speaker.title?.includes(' at '))
      score += 15

    // Bonus for local speakers (support local community)
    if (speaker.flags?.includes(Flags.localSpeaker)) score += 25

    // Bonus for underrepresented speakers (promote diversity)
    if (speaker.flags?.includes(Flags.diverseSpeaker)) score += 25

    return { speaker, score }
  })

  // Sort by score, then by name for consistency
  const sorted = scoredSpeakers.sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff
    return a.speaker.name.localeCompare(b.speaker.name)
  })

  const regular = sorted.slice(0, maxRegular).map((s) => s.speaker)

  // Track used speaker IDs
  const newUsedSpeakerIds = new Set(usedSpeakerIds)
  featured.forEach((speaker) => newUsedSpeakerIds.add(speaker._id))
  regular.forEach((speaker) => newUsedSpeakerIds.add(speaker._id))

  return { featured, regular, usedSpeakerIds: newUsedSpeakerIds }
}

// Calculate program stats
function calculateProgramStats(
  schedules: ConferenceSchedule[],
  speakers: SpeakerWithTalks[],
) {
  const allTalks: TrackTalk[] = []
  let trackCount = 0

  schedules.forEach((schedule) => {
    // Count tracks across all schedules (usually just one schedule per conference)
    trackCount = Math.max(trackCount, schedule.tracks.length)

    schedule.tracks.forEach((track) => {
      track.talks.forEach((slot) => {
        // Only include confirmed talks in stats
        if (slot.talk && slot.talk.status === 'confirmed') {
          allTalks.push(slot)
        }
      })
    })
  })

  const formats = new Set<string>()
  const topics = new Set<string>()
  let workshopCount = 0
  let localSpeakerCount = 0
  let firstTimeSpeakerCount = 0

  allTalks.forEach((talk) => {
    if (talk.talk?.format) {
      formats.add(talk.talk.format)
      // Count actual workshop sessions, not just formats
      if (talk.talk.format.startsWith('workshop')) {
        workshopCount++
      }
    }
    if (talk.talk?.topics && Array.isArray(talk.talk.topics)) {
      talk.talk.topics.forEach((topic) => {
        if (
          topic &&
          typeof topic === 'object' &&
          'title' in topic &&
          topic.title
        ) {
          topics.add(topic.title as string)
        }
      })
    }
  })

  // Count speaker diversity
  speakers.forEach((speaker) => {
    if (speaker.flags?.includes(Flags.localSpeaker)) {
      localSpeakerCount++
    }
    if (speaker.flags?.includes(Flags.firstTimeSpeaker)) {
      firstTimeSpeakerCount++
    }
  })

  return {
    totalSessions: allTalks.length,
    totalSpeakers: speakers.length,
    workshopCount,
    topicCount: topics.size,
    days: schedules.length,
    trackCount,
    localSpeakerCount,
    firstTimeSpeakerCount,
  }
}

interface ProgramHighlightsProps {
  schedules?: ConferenceSchedule[] | null
  featuredTalks?: ProposalExisting[]
  featuredSpeakers?: SpeakerWithTalks[]
  tickets_enabled?: boolean
}

export function ProgramHighlights({
  schedules,
  featuredTalks = [],
  featuredSpeakers = [],
  tickets_enabled = true,
}: ProgramHighlightsProps) {
  if (!schedules || schedules.length === 0) {
    return null
  }

  // Extract all speakers from schedules
  const allSpeakers = extractSpeakersFromSchedules(schedules)

  // Get featured talk IDs for filtering
  const featuredTalkIds = featuredTalks.map((talk) => talk._id)
  const featuredSpeakerIds = featuredSpeakers.map((speaker) => speaker._id)

  // Initialize tracking sets for duplicates
  const usedTalkIds = new Set<string>()
  const usedSpeakerIds = new Set<string>()

  // Helper function to determine featured speaker status
  const isSpeakerFeatured = (speakerId: string) =>
    featuredSpeakerIds.includes(speakerId)

  // Select talks first (featured and regular) and track used IDs
  const {
    featured: featuredTalkSlots,
    regular: regularTalks,
    usedTalkIds: updatedUsedTalkIds,
  } = selectFeaturedTalks(schedules, featuredTalkIds, 6, usedTalkIds)

  // Select speakers, avoiding those already featured in talks or previously selected
  const { featured: selectedFeaturedSpeakers, regular: regularSpeakers } =
    selectFeaturedSpeakers(
      allSpeakers,
      featuredSpeakerIds,
      6,
      usedSpeakerIds,
      updatedUsedTalkIds,
    )

  const stats = calculateProgramStats(schedules, allSpeakers)

  // Use provided featured speakers if available, otherwise use selected ones
  const displayFeaturedSpeakers =
    featuredSpeakers.length > 0 ? featuredSpeakers : selectedFeaturedSpeakers

  // Use featured talk slots (function automatically selects highest scored if none provided)
  const displayFeaturedTalks = featuredTalkSlots

  // Calculate daily rotation indices for consistent daily cycling
  const featuredSpeakerIndex = getDailyRotationIndex(
    displayFeaturedSpeakers.length,
  )
  const featuredTalkIndex = getDailyRotationIndex(displayFeaturedTalks.length)

  // Get the current day's featured speaker and talk
  const todaysFeaturedSpeaker =
    displayFeaturedSpeakers.length > 0
      ? displayFeaturedSpeakers[featuredSpeakerIndex]
      : null
  const todaysFeaturedTalk =
    displayFeaturedTalks.length > 0
      ? displayFeaturedTalks[featuredTalkIndex]
      : null

  if (
    !todaysFeaturedTalk &&
    !todaysFeaturedSpeaker &&
    regularTalks.length === 0
  ) {
    return null
  }

  return (
    <section
      id="program-highlights"
      aria-labelledby="program-highlights-title"
      className="py-20 sm:py-32"
    >
      <Container>
        {/* Section Header */}
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
          <h2
            id="program-highlights-title"
            className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400"
          >
            Program Highlights
          </h2>
          <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
            Experience world-class content from industry experts. From hands-on
            workshops to cutting-edge talks, get ready for {stats.days} days of
            learning and networking.
          </p>
        </div>

        {/* Program Stats */}
        <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cloud-blue/10 dark:bg-blue-900/20">
              <PresentationChartBarIcon className="h-6 w-6 text-brand-cloud-blue dark:text-blue-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-brand-cloud-blue dark:text-blue-400">
              Sessions
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.totalSessions}+
            </dd>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-fresh-green/10 dark:bg-green-900/20">
              <UserGroupIcon className="h-6 w-6 text-brand-fresh-green dark:text-green-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-brand-fresh-green dark:text-green-400">
              Speakers
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.totalSpeakers}+
            </dd>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-yellow/10 dark:bg-yellow-900/20">
              <MicrophoneIcon className="h-6 w-6 text-accent-yellow dark:text-yellow-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-accent-yellow dark:text-yellow-400">
              Workshops
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.workshopCount}
            </dd>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cloud-blue/10 dark:bg-blue-900/20">
              <CalendarDaysIcon className="h-6 w-6 text-brand-cloud-blue dark:text-blue-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-brand-cloud-blue dark:text-blue-400">
              Days
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.days}
            </dd>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-fresh-green/10 dark:bg-green-900/20">
              <ClockIcon className="h-6 w-6 text-brand-fresh-green dark:text-green-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-brand-fresh-green dark:text-green-400">
              Topics
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.topicCount}+
            </dd>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-900/20">
              <Squares2X2Icon className="h-6 w-6 text-purple-500 dark:text-purple-400" />
            </div>
            <dt className="font-jetbrains mt-2 text-sm text-purple-500 dark:text-purple-400">
              Tracks
            </dt>
            <dd className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
              {stats.trackCount}
            </dd>
          </div>
        </div>

        {/* Community & Diversity Stats - Optional */}
        {(stats.localSpeakerCount > 0 || stats.firstTimeSpeakerCount > 0) && (
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {stats.localSpeakerCount > 0 && (
              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-brand-fresh-green/10 dark:bg-green-900/20">
                  <MapPinIcon className="h-5 w-5 text-brand-fresh-green dark:text-green-400" />
                </div>
                <dt className="font-jetbrains mt-2 text-xs text-brand-fresh-green dark:text-green-400">
                  Local Speakers
                </dt>
                <dd className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                  {stats.localSpeakerCount}
                </dd>
              </div>
            )}
            {stats.firstTimeSpeakerCount > 0 && (
              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-900/20">
                  <SparklesIcon className="h-5 w-5 text-purple-500 dark:text-purple-400" />
                </div>
                <dt className="font-jetbrains mt-2 text-xs text-purple-500 dark:text-purple-400">
                  First Timers
                </dt>
                <dd className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-gray-200">
                  {stats.firstTimeSpeakerCount}
                </dd>
              </div>
            )}
          </div>
        )}

        {/* Featured Content */}
        {(todaysFeaturedTalk || todaysFeaturedSpeaker) && (
          <div className="mt-20">
            <div className="mb-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cloud-blue to-brand-fresh-green">
                <StarIcon className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-space-grotesk mt-4 text-3xl font-bold text-brand-slate-gray dark:text-white">
                Don&apos;t Miss These Standouts
              </h3>
              <p className="font-inter mt-2 text-lg text-brand-slate-gray dark:text-gray-300">
                Reserve your spot now to experience these exceptional sessions
                and connect with industry leaders
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                {tickets_enabled && (
                  <Button
                    href="/tickets"
                    variant="primary"
                    className="inline-flex items-center space-x-2 px-6 py-3 font-semibold"
                  >
                    <TicketIcon className="h-5 w-5" aria-hidden="true" />
                    <span>Get Your Tickets Now</span>
                  </Button>
                )}
                <Button
                  href="/program"
                  variant="outline"
                  className="inline-flex items-center space-x-2 px-6 py-3 font-semibold"
                >
                  <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
                  <span>View Full Program</span>
                </Button>
              </div>
            </div>

            <div className="grid auto-rows-fr gap-8 lg:grid-cols-2">
              {/* Featured Speaker */}
              {todaysFeaturedSpeaker && (
                <div className="flex flex-col">
                  <h4 className="font-space-grotesk mb-6 flex items-center space-x-2 text-xl font-bold text-brand-cloud-blue">
                    <StarIcon className="h-6 w-6" />
                    <span>Spotlight Speaker</span>
                  </h4>
                  <div className="flex-1">
                    <SpeakerPromotionCard
                      key={todaysFeaturedSpeaker._id}
                      speaker={todaysFeaturedSpeaker}
                      variant="featured"
                      isFeatured={isSpeakerFeatured(todaysFeaturedSpeaker._id)}
                    />
                  </div>
                </div>
              )}

              {/* Featured Session */}
              {todaysFeaturedTalk && (
                <div className="flex flex-col">
                  <h4 className="font-space-grotesk mb-6 flex items-center space-x-2 text-xl font-bold text-brand-fresh-green dark:text-green-400">
                    <RocketLaunchIcon className="h-6 w-6" />
                    <span>Must-See Session</span>
                  </h4>
                  <div className="flex-1">
                    <TalkPromotionCard
                      key={`${todaysFeaturedTalk.startTime}-${todaysFeaturedTalk.talk!._id}`}
                      talk={todaysFeaturedTalk.talk!}
                      slot={{
                        time: `${todaysFeaturedTalk.startTime} – ${todaysFeaturedTalk.endTime}`,
                      }}
                      variant="featured"
                      ctaText="View Full Program"
                      ctaUrl="/program"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regular Sessions Grid */}
        {regularTalks.length > 0 && (
          <div className="mt-20">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="font-space-grotesk text-2xl font-bold text-brand-slate-gray dark:text-white">
                More Amazing Sessions
              </h3>
              <Link
                href="/program"
                className="font-inter text-sm font-semibold text-brand-cloud-blue hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
              >
                View all sessions →
              </Link>
            </div>

            <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {regularTalks.map((slot) => {
                const proposal = slot.talk!
                return (
                  <TalkPromotionCard
                    key={`${slot.startTime}-${proposal._id}`}
                    talk={proposal}
                    slot={{ time: `${slot.startTime} – ${slot.endTime}` }}
                    variant="default"
                    ctaText="Learn More"
                    ctaUrl="/program"
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Regular Speakers Grid */}
        {regularSpeakers.length > 0 && (
          <div className="mt-20">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="font-space-grotesk text-2xl font-bold text-brand-slate-gray">
                Meet Our Expert Speakers
              </h3>
              <Link
                href="/speakers"
                className="font-inter text-sm font-semibold text-brand-cloud-blue hover:text-brand-cloud-blue/80"
              >
                View all speakers →
              </Link>
            </div>

            <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {regularSpeakers.map((speaker) => (
                <SpeakerPromotionCard
                  key={speaker._id}
                  speaker={speaker}
                  variant="default"
                  isFeatured={isSpeakerFeatured(speaker._id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="mt-20">
          <CallToAction
            title="Ready to Join the Cloud Native Journey?"
            description="Don't miss this opportunity to learn from industry experts, discover the latest trends, and connect with the Bergen cloud native community."
            showSpeakerSubmission={false}
            showTicketReservation={tickets_enabled}
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button
            href="/program"
            variant="primary"
            className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
          >
            <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
            <span>Explore Full Program</span>
          </Button>
          <Button
            href="/speakers"
            variant="outline"
            className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
          >
            <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
            <span>Meet All Speakers</span>
          </Button>
          {tickets_enabled && (
            <Button
              href="/tickets"
              variant="success"
              className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
            >
              <TicketIcon className="h-5 w-5" aria-hidden="true" />
              <span>Get Your Tickets</span>
            </Button>
          )}
        </div>
      </Container>
    </section>
  )
}
