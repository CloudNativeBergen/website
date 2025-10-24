import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import NextTalkDisplay from '@/components/stream/NextTalkDisplay'
import { SponsorBanner } from '@/components/stream/SponsorBanner'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import BlueskyAuthorFeedLooping from '@/components/stream/BlueskyAuthorFeedLooping'
import { AutoRefreshWrapper } from '@/components/stream/AutoRefreshWrapper'
import { StreamError } from '@/components/stream/StreamError'
import { STREAM_CONFIG } from '@/lib/stream/config'
import { findTrackByRoom, getAvailableRooms } from '@/lib/stream/utils'
import { DevTimeProvider } from '@/components/program/DevTimeProvider'
import { DevTimeControl } from '@/components/program/DevTimeControl'

type Props = {
  params: Promise<{ room: string }>
}

export const revalidate = 300

export default async function StreamRoomPage({ params }: Props) {
  const { room: roomParam } = await params
  const room = decodeURIComponent(roomParam).trim()

  const { conference, error } = await getConferenceForCurrentDomain({
    schedule: true,
    sponsors: true,
    confirmedTalksOnly: false,
  })

  if (error || !conference) {
    return (
      <StreamError
        title="Stream Configuration Error"
        message="Unable to load stream configuration. Please try again later."
      />
    )
  }

  if (!conference.schedules?.length) {
    return (
      <StreamError
        title="Schedule Not Available"
        message="No conference schedule available yet."
      />
    )
  }

  const matchedTrack = findTrackByRoom(conference.schedules, room)

  if (!matchedTrack) {
    const availableRooms = getAvailableRooms(conference.schedules)

    return (
      <StreamError
        title="Room Not Found"
        message={`The room '${room}' does not exist in the conference schedule.`}
      >
        {availableRooms.length > 0 && (
          <div className="mt-8">
            <p className="font-inter text-base font-semibold text-brand-slate-gray dark:text-gray-200">
              Available rooms:
            </p>
            <ul className="mt-3 space-y-2">
              {availableRooms.map((roomName) => (
                <li
                  key={roomName}
                  className="font-inter dark:text-brand-cloud-blue-light text-brand-cloud-blue"
                >
                  {roomName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </StreamError>
    )
  }

  return (
    <>
      <DevTimeProvider />
      <DevTimeControl schedules={conference.schedules} />
      <AutoRefreshWrapper intervalMs={STREAM_CONFIG.refreshInterval}>
        <div className="relative min-h-screen">
          <BackgroundImage className="absolute inset-0" />
          <Container className="relative">
            <div className={STREAM_CONFIG.layout.containerPadding}>
              {conference.sponsors && conference.sponsors.length > 0 && (
                <SponsorBanner
                  sponsors={conference.sponsors as ConferenceSponsor[]}
                  className={STREAM_CONFIG.sponsorBanner.className}
                  speed={STREAM_CONFIG.sponsorBanner.speed}
                />
              )}

              <div className={STREAM_CONFIG.layout.contentSpacing}>
                <NextTalkDisplay
                  schedules={conference.schedules}
                  roomTrackTitle={matchedTrack.trackTitle}
                  className={STREAM_CONFIG.nextTalk.className}
                />

                <BlueskyAuthorFeedLooping
                  handle={STREAM_CONFIG.blueskyFeed.handle}
                  compact={STREAM_CONFIG.blueskyFeed.compact}
                  title={STREAM_CONFIG.blueskyFeed.title}
                  speed={STREAM_CONFIG.blueskyFeed.speed}
                  maxHeight={STREAM_CONFIG.blueskyFeed.maxHeight}
                  className={STREAM_CONFIG.blueskyFeed.className}
                />
              </div>
            </div>
          </Container>
        </div>
      </AutoRefreshWrapper>
    </>
  )
}
