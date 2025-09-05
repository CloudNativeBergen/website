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

// Discount code schemas
export const CreateDiscountCodeSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
  discountCode: z.string().min(1, 'Discount code is required'),
  numberOfTickets: z.number().min(1, 'Number of tickets must be at least 1'),
  sponsorName: z.string().min(1, 'Sponsor name is required'),
  tierTitle: z.string().optional(),
  selectedTicketTypes: z.array(z.string()).optional().default([]),
})

export const GetDiscountsSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
})

export const DeleteDiscountCodeSchema = z.object({
  eventId: z.number().min(1, 'Event ID is required'),
  discountCode: z.string().min(1, 'Discount code is required'),
})

// Payment details schema
export const GetPaymentDetailsSchema = z.object({
  orderId: z.number().min(1, 'Order ID is required'),
})
