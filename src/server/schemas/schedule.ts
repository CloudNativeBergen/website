import { z } from 'zod'

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
  startTime: z.string(),
  endTime: z.string(),
})

const ScheduleTrackSchema = z.object({
  trackTitle: z.string(),
  trackDescription: z.string().optional().nullable(),
  talks: z.array(TrackTalkSchema),
})

export const SaveScheduleSchema = z.object({
  _id: z.string(),
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
