import { randomUUID } from 'crypto'
import { clientWrite } from '@/lib/sanity/client'
import { ConferenceSchedule } from '@/lib/conference/types'
import { Conference } from '@/lib/conference/types'
import {
  generateKey,
  createReference,
  createReferenceWithKey,
} from '@/lib/sanity/helpers'

export interface SaveScheduleResult {
  schedule?: ConferenceSchedule
  error?: string
}

export async function saveScheduleToSanity(
  schedule: ConferenceSchedule,
  conference: Conference,
): Promise<SaveScheduleResult> {
  try {
    console.log('Saving schedule to Sanity:', schedule)

    const sanitizedTracks = (schedule.tracks || []).map(
      (track, trackIndex) => ({
        _key: generateKey(`track-${trackIndex}`),
        trackTitle: track.trackTitle,
        trackDescription: track.trackDescription,
        talks: (track.talks || []).map((talk, talkIndex) => {
          const baseKey = `talk-${trackIndex}-${talkIndex}-${talk.startTime.replace(':', '')}`

          if (talk.placeholder) {
            return {
              _key: generateKey(`${baseKey}-service`),
              placeholder: talk.placeholder,
              startTime: talk.startTime,
              endTime: talk.endTime,
            }
          }

          if (talk.talk) {
            const talkId =
              talk.talk._id ||
              (talk.talk as unknown as { _ref?: string })._ref ||
              ''
            return {
              _key: generateKey(`${baseKey}-${talkId}`),
              talk: createReference(talkId),
              startTime: talk.startTime,
              endTime: talk.endTime,
            }
          }

          return {
            _key: generateKey(`${baseKey}-fallback`),
            startTime: talk.startTime,
            endTime: talk.endTime,
          }
        }),
      }),
    )

    let savedSchedule: ConferenceSchedule

    if (schedule._id && schedule._id !== '') {
      // SECURITY: `schedule._id` comes from the client, and `isOrganizer` is
      // global across every edition (an organizer of conference A is an
      // organizer on all domains). Without a scope check, a request could patch
      // ANOTHER conference's schedule — or any document id at all — overwriting
      // its `date`/`tracks`. Confirm the target is a `schedule` belonging to the
      // conference being served before writing.
      const target = await clientWrite.fetch<{
        _type: string
        conferenceRef: string | null
      } | null>(`*[_id == $id][0]{ _type, "conferenceRef": conference._ref }`, {
        id: schedule._id,
      })

      // One generic message for missing, wrong-type, and wrong-conference so a
      // caller can't probe whether an arbitrary document id exists.
      if (
        !target ||
        target._type !== 'schedule' ||
        target.conferenceRef !== conference._id
      ) {
        return { error: 'Schedule not found or not accessible' }
      }

      await clientWrite
        .patch(schedule._id)
        .set({
          date: schedule.date,
          tracks: sanitizedTracks,
        })
        .commit()

      savedSchedule = schedule
    } else {
      // Pre-generate the id so the create and the conference-link append run in
      // ONE atomic transaction. Previously these were two sequential writes: if
      // the append failed after the create succeeded, the error was swallowed
      // and the client never learned the new id — orphaning the created
      // schedule and creating a duplicate on the next save.
      const newId = randomUUID()
      const newScheduleDoc = {
        _id: newId,
        _type: 'schedule',
        date: schedule.date,
        tracks: sanitizedTracks,
        conference: createReference(conference._id),
      }

      await clientWrite
        .transaction()
        .create(newScheduleDoc)
        .patch(conference._id, (patch) =>
          patch
            .setIfMissing({ schedules: [] })
            // Array items need a stable _key, matching other reference arrays.
            .append('schedules', [createReferenceWithKey(newId, 'schedule')]),
        )
        .commit()

      savedSchedule = {
        ...schedule,
        _id: newId,
      }
    }

    console.log('Schedule saved successfully:', savedSchedule._id)

    return { schedule: savedSchedule }
  } catch (error) {
    console.error('Error saving schedule to Sanity:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to save schedule',
    }
  }
}
