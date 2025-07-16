import { clientWrite } from '@/lib/sanity/client'
import { ConferenceSchedule } from '@/lib/conference/types'
import { Conference } from '@/lib/conference/types'

export interface SaveScheduleResult {
  schedule?: ConferenceSchedule
  error?: string
}

/**
 * Save schedule to Sanity and link it to the conference
 */
export async function saveScheduleToSanity(
  schedule: ConferenceSchedule,
  conference: Conference,
): Promise<SaveScheduleResult> {
  try {
    console.log('Saving schedule to Sanity:', schedule)

    // Transform tracks to match Sanity schema
    const sanitizedTracks = schedule.tracks.map((track) => ({
      trackTitle: track.trackTitle,
      trackDescription: track.trackDescription,
      talks: track.talks.map((talk) => {
        // For service sessions (placeholder text), don't include talk reference
        if (talk.placeholder) {
          return {
            placeholder: talk.placeholder,
            startTime: talk.startTime,
            endTime: talk.endTime,
          }
        }

        // For regular talks, save as reference
        if (talk.talk) {
          return {
            talk: {
              _type: 'reference',
              _ref: talk.talk._id,
            },
            startTime: talk.startTime,
            endTime: talk.endTime,
          }
        }

        // Fallback - this shouldn't happen in normal usage
        return {
          startTime: talk.startTime,
          endTime: talk.endTime,
        }
      }),
    }))

    let savedSchedule: ConferenceSchedule

    if (schedule._id && schedule._id !== '') {
      // Update existing schedule
      await clientWrite
        .patch(schedule._id)
        .set({
          date: schedule.date,
          tracks: sanitizedTracks,
        })
        .commit()

      // Return the original schedule since the structure is already correct
      savedSchedule = schedule
    } else {
      // Create new schedule
      const newScheduleDoc = {
        _type: 'schedule',
        date: schedule.date,
        tracks: sanitizedTracks,
      }

      const createdSchedule = await clientWrite.create(newScheduleDoc)

      // Return the original schedule structure with the new ID
      savedSchedule = {
        ...schedule,
        _id: createdSchedule._id,
      }

      // Update the conference to reference this schedule if not already linked
      const existingScheduleIds = conference.schedules?.map((s) => s._id) || []
      if (!existingScheduleIds.includes(savedSchedule._id)) {
        await clientWrite
          .patch(conference._id)
          .setIfMissing({ schedules: [] })
          .append('schedules', [
            { _type: 'reference', _ref: savedSchedule._id },
          ])
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
