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
