/**
 * Zod schemas for ticket target configuration validation
 */

import { z } from 'zod'

// Sales milestone schema
export const SalesMilestoneSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  target_percentage: z.number().min(0).max(100),
  label: z.string().optional(),
})

// Ticket target configuration schema
export const TicketTargetConfigSchema = z.object({
  enabled: z.boolean(),
  sales_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  target_curve: z
    .enum(['linear', 'early_push', 'late_push', 's_curve'])
    .optional(),
  milestones: z.array(SalesMilestoneSchema).optional(),
})

// Conference ticket settings update schema
export const TicketSettingsUpdateSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
  ticket_capacity: z.number().min(1, 'Capacity must be at least 1').optional(),
  ticket_targets: TicketTargetConfigSchema.optional(),
})

// ID parameter schema
export const ConferenceIdSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
})
