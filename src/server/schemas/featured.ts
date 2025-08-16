/**
 * Zod validation schemas for featured content management
 * Handles featured speakers and talks operations
 */

import { z } from 'zod'

// Base schemas for featured content operations
const SpeakerIdSchema = z.object({
  speakerId: z.string().min(1, 'Speaker ID is required'),
})

const TalkIdSchema = z.object({
  talkId: z.string().min(1, 'Talk ID is required'),
})

// Featured content operation schemas (using shared base schemas)
export const FeaturedSpeakerInputSchema = SpeakerIdSchema
export const FeaturedSpeakerRemoveSchema = SpeakerIdSchema

export const FeaturedTalkInputSchema = TalkIdSchema
export const FeaturedTalkRemoveSchema = TalkIdSchema

// Response schemas
export const FeaturedContentSummarySchema = z.object({
  featuredSpeakersCount: z.number(),
  featuredTalksCount: z.number(),
  availableSpeakersCount: z.number(),
  availableTalksCount: z.number(),
})

// Types for TypeScript inference
export type FeaturedSpeakerInput = z.infer<typeof FeaturedSpeakerInputSchema>
export type FeaturedTalkInput = z.infer<typeof FeaturedTalkInputSchema>
export type FeaturedSpeakerRemove = z.infer<typeof FeaturedSpeakerRemoveSchema>
export type FeaturedTalkRemove = z.infer<typeof FeaturedTalkRemoveSchema>
export type FeaturedContentSummary = z.infer<
  typeof FeaturedContentSummarySchema
>
