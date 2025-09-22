import { z } from 'zod'

export const SalesMilestoneSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  target_percentage: z.number().min(0).max(100),
  label: z.string(),
})

export const SalesTargetConfigSchema = z.object({
  enabled: z.boolean(),
  sales_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  target_curve: z.enum(['linear', 'early_push', 'late_push', 's_curve']),
  milestones: z.array(SalesMilestoneSchema),
})

export const TicketSettingsUpdateSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
  ticket_capacity: z.number().min(1, 'Capacity must be at least 1').optional(),
  ticket_targets: SalesTargetConfigSchema.optional(),
})

export const ConferenceIdSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
})

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

export const GetPaymentDetailsSchema = z.object({
  orderId: z.number().min(1, 'Order ID is required'),
})
