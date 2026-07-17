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
  /**
   * Set when the update was rejected by optimistic-concurrency: the day was
   * changed elsewhere since it was loaded (`ifRevisionId` mismatch). Distinct
   * from a generic `error` so the router can map it to a 409 CONFLICT and the UI
   * can tell the organizer to reload rather than retry blindly.
   */
  conflict?: boolean
}

/**
 * The set of `talk` document ids belonging to `conferenceId`. The SAVE validator
 * asserts every referenced talk is in this set, rejecting dangling refs (deleted
 * talks) and foreign refs (talks from another edition). Fetched once per save.
 */
export async function getValidTalkIds(
  conferenceId: string,
): Promise<Set<string>> {
  const ids = await clientWrite.fetch<string[]>(
    `*[_type == "talk" && conference._ref == $conferenceId]._id`,
    { conferenceId },
  )
  return new Set(ids || [])
}

/** True when a Sanity write failed because `ifRevisionId` did not match (409). */
function isRevisionMismatch(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number })?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision') && message.includes('mismatch')
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

      // Optimistic concurrency: when the client carried a `_rev`, patch with
      // `ifRevisionId` so a save is rejected if the day changed since it was
      // loaded (two organizers editing the same day). Sanity throws a 409 on
      // mismatch, which we surface as a distinct `conflict` result. The commit
      // returns the persisted document, so we thread the NEW `_rev` back to the
      // client — a second save in the same session then isn't a false conflict.
      let patch = clientWrite.patch(schedule._id)
      if (schedule._rev) {
        patch = patch.ifRevisionId(schedule._rev)
      }

      const committed = await patch
        .set({
          date: schedule.date,
          tracks: sanitizedTracks,
        })
        .commit()

      savedSchedule = { ...schedule, _rev: committed._rev }
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

      // Read back the created document's `_rev` so a follow-up save in the same
      // session carries a revision and participates in optimistic concurrency
      // (rather than always taking the unconditional-write path).
      const created = await clientWrite.fetch<{ _rev: string } | null>(
        `*[_id == $id][0]{ _rev }`,
        { id: newId },
      )

      savedSchedule = {
        ...schedule,
        _id: newId,
        _rev: created?._rev,
      }
    }

    console.log('Schedule saved successfully:', savedSchedule._id)

    return { schedule: savedSchedule }
  } catch (error) {
    if (isRevisionMismatch(error)) {
      console.warn('Schedule save conflict (stale revision):', schedule._id)
      return {
        conflict: true,
        error: 'This day was changed elsewhere since you loaded it.',
      }
    }
    console.error('Error saving schedule to Sanity:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to save schedule',
    }
  }
}
