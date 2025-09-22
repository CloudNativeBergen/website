import { z } from 'zod'

const SpeakerIdSchema = z.object({
  speakerId: z.string().min(1, 'Speaker ID is required'),
})

const TalkIdSchema = z.object({
  talkId: z.string().min(1, 'Talk ID is required'),
})

export const FeaturedSpeakerInputSchema = SpeakerIdSchema
export const FeaturedSpeakerRemoveSchema = SpeakerIdSchema

export const FeaturedTalkInputSchema = TalkIdSchema
export const FeaturedTalkRemoveSchema = TalkIdSchema

export const FeaturedContentSummarySchema = z.object({
  featuredSpeakersCount: z.number(),
  featuredTalksCount: z.number(),
  availableSpeakersCount: z.number(),
  availableTalksCount: z.number(),
})

export type FeaturedSpeakerInput = z.infer<typeof FeaturedSpeakerInputSchema>
export type FeaturedTalkInput = z.infer<typeof FeaturedTalkInputSchema>
export type FeaturedSpeakerRemove = z.infer<typeof FeaturedSpeakerRemoveSchema>
export type FeaturedTalkRemove = z.infer<typeof FeaturedTalkRemoveSchema>
export type FeaturedContentSummary = z.infer<
  typeof FeaturedContentSummarySchema
>
