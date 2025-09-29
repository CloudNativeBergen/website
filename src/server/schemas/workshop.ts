import { z } from 'zod'
import { WorkshopSignupStatus } from '@/lib/workshop/types'

// Input Validation Schemas
export const workshopSignupInputSchema = z.object({
  userEmail: z.string().email('Invalid email address'),
  userName: z
    .string()
    .min(1, 'User name is required')
    .max(255, 'User name too long'),
  userWorkOSId: z.string().min(1, 'WorkOS ID is required'),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  operatingSystem: z.enum(['windows', 'macos', 'linux']),
  workshop: z.object({
    _type: z.literal('reference'),
    _ref: z.string().min(1, 'Workshop reference is required'),
  }),
  conference: z.object({
    _type: z.literal('reference'),
    _ref: z.string().min(1, 'Conference reference is required'),
  }),
  status: z
    .nativeEnum(WorkshopSignupStatus)
    .optional()
    .default(WorkshopSignupStatus.WAITLIST),
  notes: z.string().optional(),
})

export const workshopSignupUpdateSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
  status: z.nativeEnum(WorkshopSignupStatus),
  notes: z.string().optional(),
})

export const workshopListInputSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
  includeCapacity: z.boolean().optional().default(false),
})

export const workshopAvailabilitySchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  conferenceId: z.string().min(1, 'Conference ID is required'),
})

// Query Schemas
export const workshopSignupByIdSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
})

export const workshopSignupsByUserSchema = z
  .object({
    userEmail: z.string().email('Invalid email address').optional(),
    userWorkOSId: z.string().optional(),
    conferenceId: z.string().optional(),
  })
  .refine((data) => data.userEmail || data.userWorkOSId, {
    message: 'Either userEmail or userWorkOSId is required',
  })

export const workshopSignupsByWorkshopSchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  status: z.nativeEnum(WorkshopSignupStatus).optional(),
  includeUserDetails: z.boolean().optional().default(false),
})

// Action Schemas
export const cancelWorkshopSignupSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
  reason: z.string().max(500, 'Reason too long').optional(),
})

export const confirmWorkshopSignupSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
  sendEmail: z.boolean().optional().default(true),
})

export const resendConfirmationSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
})

// Batch Operation Schemas
export const batchConfirmSignupsSchema = z.object({
  signupIds: z.array(z.string()).min(1, 'At least one signup ID is required'),
  sendEmails: z.boolean().optional().default(true),
})

export const batchCancelSignupsSchema = z.object({
  signupIds: z.array(z.string()).min(1, 'At least one signup ID is required'),
  reason: z.string().max(500, 'Reason too long').optional(),
})

// Filter Schemas
export const workshopSignupFiltersSchema = z.object({
  conferenceId: z.string().optional(),
  workshopId: z.string().optional(),
  status: z.nativeEnum(WorkshopSignupStatus).optional(),
  userEmail: z.string().email('Invalid email address').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
  sortBy: z
    .enum(['signedUpAt', 'userName', 'userEmail', 'status'])
    .optional()
    .default('signedUpAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

// Workshop Management Schemas
export const createWorkshopSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().min(1, 'Description is required'),
  format: z.enum(['workshop_120', 'workshop_240']),
  capacity: z
    .number()
    .int()
    .positive('Capacity must be positive')
    .max(500, 'Capacity too large'),
  speakerId: z.string().min(1, 'Speaker ID is required'),
  conferenceId: z.string().min(1, 'Conference ID is required'),
})

export const updateWorkshopCapacitySchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  capacity: z
    .number()
    .int()
    .positive('Capacity must be positive')
    .max(500, 'Capacity too large'),
})

// Email Schemas
export const sendWorkshopReminderSchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(255, 'Subject too long'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message too long'),
  onlyConfirmed: z.boolean().optional().default(true),
})

// Export Schemas
export const exportWorkshopSignupsSchema = z
  .object({
    workshopId: z.string().optional(),
    conferenceId: z.string().optional(),
    format: z.enum(['csv', 'json']).optional().default('csv'),
    includePersonalData: z.boolean().optional().default(false),
  })
  .refine((data) => data.workshopId || data.conferenceId, {
    message: 'Either workshopId or conferenceId is required',
  })

// Validation Helpers
export type WorkshopSignupInput = z.infer<typeof workshopSignupInputSchema>
export type WorkshopSignupUpdate = z.infer<typeof workshopSignupUpdateSchema>
export type WorkshopSignupFilters = z.infer<typeof workshopSignupFiltersSchema>
export type CancelWorkshopSignupInput = z.infer<
  typeof cancelWorkshopSignupSchema
>
export type ConfirmWorkshopSignupInput = z.infer<
  typeof confirmWorkshopSignupSchema
>
