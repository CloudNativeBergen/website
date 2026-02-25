import { z } from 'zod'

export const BadgeTypeSchema = z.enum(['speaker', 'organizer'])

export const IssueBadgeInputSchema = z.object({
  speakerId: z.string().min(1, 'Speaker ID is required'),
  conferenceId: z.string().min(1, 'Conference ID is required'),
  badgeType: BadgeTypeSchema,
  centerGraphicSvg: z.string().optional(),
  sendEmail: z.boolean().optional().default(true),
})

export const BulkIssueBadgeInputSchema = z.object({
  speakerIds: z.array(z.string()).min(1, 'At least one speaker required'),
  conferenceId: z.string().min(1, 'Conference ID is required'),
  badgeType: BadgeTypeSchema,
  centerGraphicSvg: z.string().optional(),
  sendEmail: z.boolean().optional().default(true),
})

export const ListBadgesInputSchema = z.object({
  conferenceId: z.string().optional(),
  speakerId: z.string().optional(),
})

export const BadgeIdInputSchema = z.object({
  badgeId: z.string().min(1, 'Badge ID is required'),
})

export const ResendBadgeEmailInputSchema = z.object({
  badgeId: z.string().min(1, 'Badge ID is required'),
})

export const DeleteBadgeInputSchema = z.object({
  badgeId: z.string().min(1, 'Badge ID is required'),
})

export const ValidateBadgeInputSchema = z.object({
  svg: z.string().min(1, 'SVG content is required'),
})
