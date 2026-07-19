import { z } from 'zod'
import { WorkshopSignupStatus } from '@/lib/workshop/types'

/**
 * Full signup payload INCLUDING the user identity fields. This is only safe for
 * admin (`adminProcedure`) callers such as `admin.manualSignup`, where an
 * organizer intentionally registers a named participant. It MUST NOT back a
 * public procedure — a public caller supplying `userWorkOSId`/`userEmail` could
 * sign up (or impersonate) any other person. Public self-service signups use
 * `workshopSignupClientInputSchema` below, which omits identity entirely; the
 * server derives it from the WorkOS session.
 */
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

/**
 * Public self-service signup payload. Deliberately carries NO identity
 * (`userWorkOSId`/`userEmail`/`userName`) and NO `status`: the acting identity
 * is bound server-side to the authenticated WorkOS session, and confirmed-vs-
 * waitlist is decided by live capacity on the server. Removing these fields from
 * the client contract is what closes the identity-spoofing hole.
 */
export const workshopSignupClientInputSchema = z.object({
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
  notes: z.string().optional(),
})

export const workshopListInputSchema = z.object({
  includeCapacity: z.boolean().optional().default(false),
})

export const workshopAvailabilitySchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
})

export const workshopSignupsByWorkshopSchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  status: z.nativeEnum(WorkshopSignupStatus).optional(),
  includeUserDetails: z.boolean().optional().default(false),
})

export const cancelWorkshopSignupSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
  reason: z.string().max(500, 'Reason too long').optional(),
})

export const confirmWorkshopSignupSchema = z.object({
  signupId: z.string().min(1, 'Signup ID is required'),
  sendEmail: z.boolean().optional().default(true),
})

export const batchConfirmSignupsSchema = z.object({
  signupIds: z.array(z.string()).min(1, 'At least one signup ID is required'),
  sendEmails: z.boolean().optional().default(true),
})

export const batchCancelSignupsSchema = z.object({
  signupIds: z.array(z.string()).min(1, 'At least one signup ID is required'),
  reason: z.string().max(500, 'Reason too long').optional(),
})

export const workshopSignupFiltersSchema = z.object({
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

export const updateWorkshopCapacitySchema = z.object({
  workshopId: z.string().min(1, 'Workshop ID is required'),
  capacity: z
    .number()
    .int()
    .positive('Capacity must be positive')
    .max(500, 'Capacity too large'),
})

export type WorkshopSignupInput = z.infer<typeof workshopSignupInputSchema>

export const WorkshopSignupIdSchema = z.object({
  signupId: z.string(),
})
