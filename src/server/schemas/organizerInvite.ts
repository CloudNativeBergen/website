import { z } from 'zod'
import { nullToUndefined } from './common'

/**
 * ORGANIZER INVITE (platform#49).
 *
 * There is deliberately NO `conferenceId` on any of these: the conference is
 * always `resolveConferenceId()` from the request host, never client input.
 */

export const OrganizerInviteCreateSchema = z.object({
  email: z.string().trim().min(1, 'An email address is required').max(254),
  name: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform(nullToUndefined),
})

export const OrganizerInviteRevokeSchema = z.object({
  invitationId: z.string().trim().min(1, 'An invitation id is required'),
})

export const OrganizerInviteAcceptSchema = z.object({
  token: z.string().trim().min(1, 'An invitation token is required'),
})
