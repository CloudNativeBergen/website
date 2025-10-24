import { z } from 'zod'
import { Occupation, TShirtSize } from './types'

export const ConsentInputSchema = z.object({
  dataProcessing: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the data processing terms',
  }),
})

export const VolunteerFormInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),

  email: z
    .string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),

  phone: z
    .string()
    .min(1, 'Phone number is required')
    .max(50, 'Phone number must be less than 50 characters'),

  occupation: z.enum(
    [
      Occupation.STUDENT,
      Occupation.WORKING,
      Occupation.UNEMPLOYED,
      Occupation.OTHER,
    ] as const,
    {
      message: 'Please select an occupation',
    },
  ),

  availability: z
    .string()
    .max(1000, 'Availability must be less than 1000 characters')
    .optional(),

  preferredTasks: z
    .array(z.string().max(100, 'Each task must be less than 100 characters'))
    .max(10, 'Maximum 10 tasks allowed')
    .optional(),

  tshirtSize: z
    .enum([
      TShirtSize.XS,
      TShirtSize.S,
      TShirtSize.M,
      TShirtSize.L,
      TShirtSize.XL,
      TShirtSize.XXL,
    ])
    .optional(),

  dietaryRestrictions: z
    .string()
    .max(500, 'Dietary restrictions must be less than 500 characters')
    .optional(),

  otherInfo: z
    .string()
    .max(1000, 'Other information must be less than 1000 characters')
    .optional(),

  conferenceId: z.string().min(1, 'Conference ID is required'),

  consent: ConsentInputSchema,
})
