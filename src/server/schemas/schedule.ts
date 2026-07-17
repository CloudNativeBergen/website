import { z } from 'zod'

// `HH:MM` in 24h. A cheap first gate at the schema boundary; the router's
// validateSchedulePayload enforces the richer rules (ordering, bounds, overlap).
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const timeString = z.string().regex(HHMM, 'Time must be HH:MM (24h)')

const TrackTalkSchema = z.object({
  talk: z
    .object({
      _id: z.string().optional().nullable(),
      _ref: z.string().optional().nullable(),
      _type: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  placeholder: z.string().optional().nullable(),
  startTime: timeString,
  endTime: timeString,
})

const ScheduleTrackSchema = z.object({
  trackTitle: z.string(),
  trackDescription: z.string().optional().nullable(),
  talks: z.array(TrackTalkSchema),
})

export const SaveScheduleSchema = z.object({
  _id: z.string(),
  // Optimistic-concurrency token from the loaded document; the SAVE patches with
  // `ifRevisionId` when present so a stale write is rejected. Absent for a new day.
  _rev: z.string().optional(),
  date: z.string(),
  tracks: z.array(ScheduleTrackSchema),
  conference: z
    .object({
      _id: z.string().optional(),
      _ref: z.string().optional(),
      _type: z.string().optional(),
    })
    .optional(),
})
