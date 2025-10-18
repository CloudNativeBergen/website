import { z } from 'zod'
import { VolunteerStatus } from '@/lib/volunteer/types'

export const GetVolunteerByIdSchema = z.object({
  id: z.string(),
})

export const GetVolunteersByConferenceSchema = z.object({
  conferenceId: z.string().optional(),
})

export const UpdateVolunteerStatusSchema = z.object({
  volunteerId: z.string(),
  status: z.nativeEnum(VolunteerStatus),
  reviewNotes: z.string().optional(),
})

export const SendVolunteerEmailSchema = z.object({
  volunteerId: z.string(),
  subject: z.string().min(1),
  message: z.string().min(1),
})

export const DeleteVolunteerSchema = z.object({
  volunteerId: z.string(),
})
