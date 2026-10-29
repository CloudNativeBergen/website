import clsx from 'clsx'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import NextTalkDisplay from '@/components/stream/NextTalkDisplay'
import { StreamSponsors } from '@/components/stream/StreamSponsors'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import BlueskyAuthorFeedLooping from '@/components/stream/BlueskyAuthorFeedLooping'
import { AutoRefreshWrapper } from '@/components/stream/AutoRefreshWrapper'
import { StreamError } from '@/components/stream/StreamError'
import { STREAM_CONFIG, deriveBlueskyHandle } from '@/lib/stream/config'
import { findTrackByRoom, getAvailableRooms } from '@/lib/stream/schedule-utils'
import { DevTimeProvider } from '@/components/program/DevTimeProvider'
import { DevTimeControl } from '@/components/program/DevTimeControl'
import { StreamWallRotation } from '@/components/stream/StreamWallRotation'
import { SCREEN_LOOK_PARAM, screenLookOverride } from '@/lib/photo-wall/screen'
import { readStreamWall } from '@/lib/stream/wall'
import { feedbackCodesForTalks } from '@/lib/feedback/server'
import { feedbackCodeUrl } from '@/lib/feedback/url'
import { RoomFeedbackCodes } from '@/components/stream/RoomFeedbackCodes'
import {
  WALL_ROTATION_PARAM,
  wallRotationRequested,
} from '@/lib/stream/wall-rotation'

type Props = {
  params: Promise<{ room: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * A room's venue screen: the sponsors, the room's next talk and the social
 * feed. `?wall=1` shows the Photo Wall in turns with it, and `&look=`
 * overrides the wall's look, as on `/wall/screen`.
 */
export default async function StreamRoomPage({ params, searchParams }: Props) {
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

  const blueskyHandle = deriveBlueskyHandle(conference.socialLinks)

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

  const sponsors = (conference.sponsors ?? []) as ConferenceSponsor[]
  const query = await searchParams

  // This room's talks only, from the cached code index (spec §7.6); the
  // client picks which to show from the time.
  const roomTalkIds = new Set(
    conference.schedules.flatMap((s) =>
      (s.tracks ?? [])
        .filter((t) => t.trackTitle === matchedTrack.trackTitle)
        .flatMap((t) => t.talks ?? [])
        .flatMap((slot) => (slot.talk?._id ? [slot.talk._id] : [])),
    ),
  )
  const feedbackUrls = Object.fromEntries(
    // A failed read hides the codes; it never takes the room screen down.
    [
      ...(await feedbackCodesForTalks(
        conference,
        roomTalkIds,
        new Date(),
      ).catch((error) => {
        console.error('Could not read the room feedback codes', error)
        return new Map<string, string>()
      })),
    ].map(([talkId, code]) => [talkId, feedbackCodeUrl(conference, code)]),
  )
  const wall = wallRotationRequested(query[WALL_ROTATION_PARAM])
    ? await readStreamWall(
        conference,
        sponsors,
        screenLookOverride(query[SCREEN_LOOK_PARAM]),
      )
    : null

  const roomView = (
    <div className="relative min-h-screen">
      <BackgroundImage className="absolute inset-0" />
      <Container className="relative">
        <div className={STREAM_CONFIG.layout.containerPadding}>
          {sponsors.length > 0 && (
            <StreamSponsors
              schedules={conference.schedules}
              roomTrackTitle={matchedTrack.trackTitle}
              sponsors={sponsors}
              className={STREAM_CONFIG.sponsorBanner.className}
              speed={STREAM_CONFIG.sponsorBanner.speed}
            />
          )}

          <div
            className={clsx(
              STREAM_CONFIG.layout.contentSpacing,
              blueskyHandle && STREAM_CONFIG.layout.splitColumns,
            )}
          >
            <NextTalkDisplay
              schedules={conference.schedules}
              roomTrackTitle={matchedTrack.trackTitle}
              className={STREAM_CONFIG.nextTalk.className}
            />

            {blueskyHandle && (
              <BlueskyAuthorFeedLooping
                handle={blueskyHandle}
                // The wall's hashtag source is the TENANT's own tag. It used
                // to be the literal '#cndb2025', so any conference
                // projecting this on a venue screen showed Cloud Native Day
                // Bergen 2025 posts. Absent → no hashtag search at all.
                hashtag={conference.socialHashtag}
                compact={STREAM_CONFIG.blueskyFeed.compact}
                title={STREAM_CONFIG.blueskyFeed.title}
                speed={STREAM_CONFIG.blueskyFeed.speed}
                maxHeight={STREAM_CONFIG.blueskyFeed.maxHeight}
                className={STREAM_CONFIG.blueskyFeed.className}
              />
            )}
          </div>

          <RoomFeedbackCodes
            schedules={conference.schedules}
            roomTrackTitle={matchedTrack.trackTitle}
            urls={feedbackUrls}
          />
        </div>
      </Container>
    </div>
  )

  return (
    <>
      <DevTimeProvider />
      <DevTimeControl schedules={conference.schedules} />
      <AutoRefreshWrapper intervalMs={STREAM_CONFIG.refreshInterval}>
        {wall ? (
          <StreamWallRotation
            schedules={conference.schedules}
            roomTrackTitle={matchedTrack.trackTitle}
            sponsors={sponsors}
            wall={wall}
          >
            {roomView}
          </StreamWallRotation>
        ) : (
          roomView
        )}
      </AutoRefreshWrapper>
    </>
  )
}
