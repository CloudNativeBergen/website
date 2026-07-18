import { z } from 'zod'
import { HHMM_PATTERN } from '@/lib/schedule/time'

const timeString = z.string().regex(HHMM_PATTERN, 'Time must be HH:MM (24h)')

// A real calendar date in YYYY-MM-DD: the regex fixes the SHAPE, the refine
// rejects impossible dates (e.g. 2026-02-30, 2026-13-01) by round-tripping
// through `Date` — an invalid day rolls over, so its ISO date no longer matches.
// Deliberately NOT range-checked against the conference dates: fabricated empty
// days already match, and out-of-range future flexibility is fine.
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, 'Date must be a real calendar date')

const TrackTalkSchema = z.object({
  talk: z
    .object({
      _id: z.string().optional().nullable(),
      _ref: z.string().optional().nullable(),
      _type: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  // Bounded so a hostile/oversized payload can't be persisted (a placeholder is
  // a short service label like "Lunch").
  placeholder: z.string().max(200).optional().nullable(),
  startTime: timeString,
  endTime: timeString,
})

const ScheduleTrackSchema = z.object({
  trackTitle: z.string().max(200),
  trackDescription: z.string().max(2000).optional().nullable(),
  // A single track holds far fewer than 300 slots in practice; the cap only
  // rejects abuse, not real schedules.
  talks: z.array(TrackTalkSchema).max(300),
})

export const SaveScheduleSchema = z
  .object({
    _id: z.string(),
    // Optimistic-concurrency token from the loaded document; the SAVE patches
    // with `ifRevisionId` when present so a stale write is rejected. Absent for a
    // new day (`_id: ''`); REQUIRED for an update — enforced by the refine below.
    _rev: z.string().optional(),
    date: dateString,
    // A conference has a handful of tracks; the cap only rejects abuse.
    tracks: z.array(ScheduleTrackSchema).max(30),
    conference: z
      .object({
        _id: z.string().optional(),
        _ref: z.string().optional(),
        _type: z.string().optional(),
      })
      .optional(),
  })
  // An UPDATE (non-empty `_id`) MUST carry its `_rev`: without it the server
  // would patch unconditionally (silent last-write-wins). The create path
  // (`_id: ''`) legitimately has no revision yet.
  .refine((value) => value._id === '' || Boolean(value._rev), {
    message: 'An existing schedule must carry its revision (_rev) to be saved.',
    path: ['_rev'],
  })
