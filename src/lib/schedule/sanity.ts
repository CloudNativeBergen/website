import { clientWrite } from '@/lib/sanity/client'
import { ConferenceSchedule } from '@/lib/conference/types'
import { Conference } from '@/lib/conference/types'
import { generateKey, createReference } from '@/lib/sanity/helpers'

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
            return {
              _key: generateKey(`${baseKey}-${talk.talk._id}`),
              talk: createReference(talk.talk._id),
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
      await clientWrite
        .patch(schedule._id)
        .set({
          date: schedule.date,
          tracks: sanitizedTracks,
        })
        .commit()

      savedSchedule = schedule
    } else {
      const newScheduleDoc = {
        _type: 'schedule',
        date: schedule.date,
        tracks: sanitizedTracks,
      }

      const createdSchedule = await clientWrite.create(newScheduleDoc)

      savedSchedule = {
        ...schedule,
        _id: createdSchedule._id,
      }

      const existingScheduleIds = conference.schedules?.map((s) => s._id) || []
      if (!existingScheduleIds.includes(savedSchedule._id)) {
        await clientWrite
          .patch(conference._id)
          .setIfMissing({ schedules: [] })
          .append('schedules', [createReference(savedSchedule._id)])
          .commit()
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
