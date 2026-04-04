import { z } from 'zod'

const TrackTalkSchema = z.object({
  talk: z
    .object({
      _id: z.string(),
    })
    .optional(),
  placeholder: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
})

const ScheduleTrackSchema = z.object({
  trackTitle: z.string(),
  trackDescription: z.string(),
  talks: z.array(TrackTalkSchema),
})

export const SaveScheduleSchema = z.object({
  _id: z.string(),
  date: z.string(),
  tracks: z.array(ScheduleTrackSchema),
  conference: z
    .object({
      _id: z.string(),
    })
    .optional(),
})
