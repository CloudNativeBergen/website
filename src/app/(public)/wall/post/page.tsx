import { connection } from 'next/server'
import {
  ComposerClosed,
  MyPostsPanel,
  WallPoster,
} from '@/components/photo-wall'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { isProgramPublished } from '@/lib/conference/state'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { deletionDate } from '@/lib/photo-wall/deletion'
import { requirePhotoWall } from '@/lib/photo-wall/page'
import { isPostingOpen } from '@/lib/photo-wall/window'
import {
  deleteMyPost,
  ensureDevice,
  getMyPosts,
  setMyPostMarketing,
} from './actions'

/**
 * The published schedule as the Talk row needs it (Talk photos spec §6.1):
 * date, rooms, times, and each talk's id and title. Nothing more goes to the
 * phone. The cast: the talk carries only what `TalkPicker` and
 * `suggestTalks` read.
 */
function taggableSchedules(
  conference: Awaited<ReturnType<typeof requirePhotoWall>>['conference'],
): ConferenceSchedule[] {
  if (!isProgramPublished(conference)) return []
  return (conference.schedules ?? []).map((day) => ({
    _id: day._id,
    date: day.date,
    tracks: day.tracks.map((track) => ({
      trackTitle: track.trackTitle,
      trackDescription: '',
      talks: track.talks
        .filter((slot) => slot.talk?._id)
        .map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          talk: { _id: slot.talk!._id, title: slot.talk!.title },
        })),
    })),
  })) as ConferenceSchedule[]
}

/**
 * `/wall/post`, the Composer the QR opens (Photo Wall spec §6.5): the
 * composer while posting is open, the closed page otherwise, each with My
 * posts (§12: Delete stays allowed after the wall closes). 404 without a
 * Photo Wall. Whether posting is open is decided per request; the submit
 * route decides again at Submit.
 */
export default async function ComposerPage({
  searchParams,
}: {
  searchParams?: Promise<{ room?: string | string[] }>
} = {}) {
  // The program's read (`schedule: true`), cached per tier, not a new one.
  const { conference, wall } = await requirePhotoWall({
    schedule: true,
    confirmedTalksOnly: false,
  })
  await connection()
  const { room } = (await searchParams) ?? {}
  const logo = pickConferenceLogoProps(conference)
  const deletesOn = deletionDate(conference.endDate)
  const actions = { getMyPosts, deleteMyPost, setMyPostMarketing }
  if (!deletesOn || !isPostingOpen(wall, conference, new Date())) {
    return (
      <ComposerClosed logo={logo} wallClosed={wall.closedAt !== null}>
        <MyPostsPanel {...actions} />
      </ComposerClosed>
    )
  }
  return (
    <WallPoster
      logo={logo}
      deletesOn={deletesOn}
      ensureDevice={ensureDevice}
      schedules={taggableSchedules(conference)}
      room={typeof room === 'string' ? room : undefined}
      {...actions}
    />
  )
}
