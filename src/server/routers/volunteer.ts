import { TRPCError } from '@trpc/server'
import {
  router,
  adminProcedure,
  publicProcedure,
  resolveConferenceId,
} from '../trpc'
import {
  GetVolunteerByIdSchema,
  UpdateVolunteerStatusSchema,
  UpdateVolunteerDetailsSchema,
  SendVolunteerEmailSchema,
  SendVolunteerBulkEmailSchema,
  DeleteVolunteerSchema,
  ConfirmVolunteerAttendanceSchema,
  DeclineVolunteerAttendanceSchema,
  CreateVolunteerSchema,
} from '../schemas/volunteer'
import { requireDocumentInCurrentConference } from '../tenancy'
import { fillVolunteerName } from '@/lib/volunteer/fillName'
import type { VolunteerSendFailure } from '@/lib/volunteer/chunkedSend'
import type { EmailResult } from '@/lib/email/config'
import {
  getVolunteersByConference,
  getVolunteerById,
  updateVolunteerStatus,
  updateVolunteerDetails,
  deleteVolunteer,
  createVolunteer,
  hasActiveVolunteerByEmail,
  recordVolunteerApprovalEmailSent,
  confirmVolunteerAttendance,
  declineVolunteerAttendance,
} from '@/lib/volunteer/sanity'
import { verifyVolunteerConfirmToken } from '@/lib/volunteer/token'
import { VolunteerStatus } from '@/lib/volunteer/types'
import type {
  VolunteerInput,
  VolunteerWithConference,
} from '@/lib/volunteer/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendVolunteerApprovalEmail } from '@/lib/email/volunteer'
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy/config'
import { notifyNewVolunteer } from '@/lib/slack/notify'
import { runAfterResponse } from '@/server/runAfterResponse'
import { getCurrentDateTime } from '@/lib/time'
import { createNotifications } from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'

/** Refuse up front, before any send, when the conference has no sender address. */
function requireSenderAddress(recipients: VolunteerWithConference[]) {
  const conf = recipients[0]?.conference
  if (conf && !conf.contactEmail && !conf.cfpEmail) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'The conference has no contact email set, so nothing was sent. Add one in the conference settings.',
    })
  }
}

/**
 * Send to each volunteer in turn (callers cap the list at
 * VOLUNTEER_EMAIL_CHUNK, which fits the route's time budget).
 */
async function sendEachVolunteer(
  recipients: VolunteerWithConference[],
  send: (v: VolunteerWithConference) => Promise<EmailResult<unknown>>,
  onSent?: (v: VolunteerWithConference) => Promise<void>,
): Promise<{ sent: number; failed: VolunteerSendFailure[] }> {
  let sent = 0
  const failed: VolunteerSendFailure[] = []
  for (const v of recipients) {
    const result = await send(v)
    if (result.error) {
      failed.push({ id: v._id, email: v.email, error: result.error.error })
      continue
    }
    sent++
    await onSent?.(v)
  }
  return { sent, failed }
}

export const volunteerRouter = router({
  create: publicProcedure
    .input(CreateVolunteerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const ipAddress = ctx.ipAddress || ''
        const conferenceId = await resolveConferenceId()

        const { exists, error: dupError } = await hasActiveVolunteerByEmail(
          conferenceId,
          input.email,
        )
        if (dupError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check existing volunteer applications',
            cause: dupError,
          })
        }
        if (exists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'An application with this email has already been submitted for this conference',
          })
        }

        const volunteerInput: VolunteerInput = {
          name: input.name,
          email: input.email,
          phone: input.phone,
          occupation: input.occupation,
          availability: input.availability,
          preferredTasks: input.preferredTasks,
          tshirtSize: input.tshirtSize,
          dietaryRestrictions: input.dietaryRestrictions,
          otherInfo: input.otherInfo,
          conference: {
            _type: 'reference',
            _ref: conferenceId,
          },
          consent: {
            dataProcessing: {
              granted: true,
              grantedAt: getCurrentDateTime(),
              ipAddress,
            },
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          },
        }

        const result = await createVolunteer(volunteerInput)

        if (result.error || !result.volunteer) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              result.error?.message || 'Failed to create volunteer record',
            cause: result.error,
          })
        }

        try {
          const { conference, error } = await getConferenceForCurrentDomain()
          if (!error && conference) {
            // Slack webhook round-trip, deferred past the response — but via
            // `after()`, never a bare floating promise. `notifyNewVolunteer`
            // has its own try/catch so it cannot reject, which is exactly why
            // a dropped one is INVISIBLE: the instance is frozen before the
            // POST lands, nothing throws, nothing logs, and organizers simply
            // never see the application.
            const createdVolunteer = result.volunteer
            runAfterResponse(() =>
              notifyNewVolunteer(createdVolunteer, conference),
            )

            // In-app mirror for organizers. This is a public endpoint, so
            // there is no actor to exclude. Shares createNotifications'
            // never-fail contract: the volunteer record is already created.
            const volunteerName = result.volunteer.name
            // TEAMS-2: volunteer signups route to the `volunteers` team (all
            // organizers when it is not configured — the shared fallback).
            const organizerIds = await resolveRoutedOrganizerIds({
              conferenceId: conference._id,
              teamKey: 'volunteers',
            })
            await createNotifications(
              organizerIds
                .filter((id) => id)
                .map((id): NotificationInput => ({
                  recipientId: id,
                  conferenceId: conference._id,
                  notificationType: 'system',
                  title: `New volunteer signup: ${volunteerName}`,
                  link: '/admin/volunteers',
                })),
            )
          }
        } catch {
          // Ignore notification errors
        }

        return {
          success: true,
          volunteerId: result.volunteer._id,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create volunteer application',
          cause: error,
        })
      }
    }),

  confirmAttendance: publicProcedure
    .input(ConfirmVolunteerAttendanceSchema)
    .mutation(async ({ input }) => {
      try {
        const verification = verifyVolunteerConfirmToken(input.token)
        if (!verification.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid confirmation link',
          })
        }
        const { payload } = verification

        const conferenceId = await resolveConferenceId()
        if (payload.conferenceId !== conferenceId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No volunteer with that id for this request',
          })
        }

        await requireDocumentInCurrentConference(
          payload.volunteerId,
          'volunteer',
        )

        const { volunteer, error: fetchError } = await getVolunteerById(
          payload.volunteerId,
        )
        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: fetchError,
          })
        }

        if (
          !volunteer ||
          volunteer.email?.trim().toLowerCase() !== payload.email
        ) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        if (
          volunteer.status !== VolunteerStatus.APPROVED &&
          volunteer.status !== VolunteerStatus.CONFIRMED
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only approved volunteers can confirm attendance',
          })
        }

        let confirmedAt = volunteer.confirmedAt
        if (volunteer.status === VolunteerStatus.APPROVED) {
          confirmedAt = getCurrentDateTime()
          const { success, error: confirmError } =
            await confirmVolunteerAttendance(
              volunteer._id,
              confirmedAt,
              volunteer._rev,
            )
          if (confirmError || !success) {
            const { volunteer: latest } = await getVolunteerById(volunteer._id)
            if (
              !latest ||
              latest.email?.trim().toLowerCase() !== payload.email
            ) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Volunteer not found',
              })
            }
            if (latest.status === VolunteerStatus.CONFIRMED) {
              confirmedAt = latest.confirmedAt || confirmedAt
            } else if (latest.status !== VolunteerStatus.APPROVED) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Only approved volunteers can confirm attendance',
              })
            } else {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to confirm volunteer attendance',
                cause: confirmError,
              })
            }
          } else {
            try {
              const organizerIds = await resolveRoutedOrganizerIds({
                conferenceId,
                teamKey: 'volunteers',
              })
              await createNotifications(
                organizerIds
                  .filter((id) => id)
                  .map((id): NotificationInput => ({
                    recipientId: id,
                    conferenceId,
                    notificationType: 'system',
                    title: `Volunteer confirmed attendance: ${volunteer.name}`,
                    link: '/admin/volunteers',
                  })),
              )
            } catch {
              // Never fail confirmation on notification error
            }
          }
        }

        return {
          status: VolunteerStatus.CONFIRMED,
          confirmedAt: confirmedAt || getCurrentDateTime(),
          volunteerName: volunteer.name,
          conferenceTitle: volunteer.conference?.title || '',
          registrationUrl:
            volunteer.conference?.volunteerRegistrationLink ?? null,
          slackInviteUrl: volunteer.conference?.volunteerSlackInviteUrl ?? null,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to confirm volunteer attendance',
          cause: error,
        })
      }
    }),

  declineAttendance: publicProcedure
    .input(DeclineVolunteerAttendanceSchema)
    .mutation(async ({ input }) => {
      try {
        const verification = verifyVolunteerConfirmToken(input.token)
        if (!verification.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid confirmation link',
          })
        }
        const { payload } = verification

        const conferenceId = await resolveConferenceId()
        if (payload.conferenceId !== conferenceId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No volunteer with that id for this request',
          })
        }

        await requireDocumentInCurrentConference(
          payload.volunteerId,
          'volunteer',
        )

        const { volunteer, error: fetchError } = await getVolunteerById(
          payload.volunteerId,
        )
        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: fetchError,
          })
        }

        if (
          !volunteer ||
          volunteer.email?.trim().toLowerCase() !== payload.email
        ) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Volunteer not found',
          })
        }

        if (volunteer.status === VolunteerStatus.PENDING) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Only approved or confirmed volunteers can decline attendance',
          })
        }

        if (volunteer.status !== VolunteerStatus.REJECTED) {
          const declinedAt = getCurrentDateTime()
          const { success, error: declineError } =
            await declineVolunteerAttendance(
              volunteer._id,
              declinedAt,
              volunteer._rev,
              input.reason,
              volunteer.reviewNotes,
            )
          if (declineError || !success) {
            const { volunteer: latest } = await getVolunteerById(volunteer._id)
            if (
              !latest ||
              latest.email?.trim().toLowerCase() !== payload.email
            ) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Volunteer not found',
              })
            }
            if (latest.status === VolunteerStatus.PENDING) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'Only approved or confirmed volunteers can decline attendance',
              })
            }
            if (latest.status !== VolunteerStatus.REJECTED) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to decline volunteer attendance',
                cause: declineError,
              })
            }
          } else {
            try {
              const organizerIds = await resolveRoutedOrganizerIds({
                conferenceId,
                teamKey: 'volunteers',
              })
              await createNotifications(
                organizerIds
                  .filter((id) => id)
                  .map((id): NotificationInput => ({
                    recipientId: id,
                    conferenceId,
                    notificationType: 'system',
                    title: `Volunteer declined attendance: ${volunteer.name}`,
                    link: '/admin/volunteers',
                  })),
              )
            } catch {
              // Never fail decline on notification error
            }
          }
        }

        return {
          status: VolunteerStatus.REJECTED,
          volunteerName: volunteer.name,
          conferenceTitle: volunteer.conference?.title || '',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to decline volunteer attendance',
          cause: error,
        })
      }
    }),

  admin: router({
    list: adminProcedure.query(async () => {
      try {
        const conferenceId = await resolveConferenceId()
        const { volunteers, error } =
          await getVolunteersByConference(conferenceId)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteers',
            cause: error,
          })
        }

        return volunteers
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch volunteers',
          cause: error,
        })
      }
    }),

    getById: adminProcedure
      .input(GetVolunteerByIdSchema)
      .query(async ({ input }) => {
        try {
          // OWNERSHIP (#730): a READ of the same unscoped lookup — volunteer
          // applications carry contact details, so scope it like the mutations.
          await requireDocumentInCurrentConference(input.id, 'volunteer')
          const { volunteer, error } = await getVolunteerById(input.id)

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch volunteer',
              cause: error,
            })
          }

          if (!volunteer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Volunteer not found',
            })
          }

          return volunteer
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteer',
            cause: error,
          })
        }
      }),

    updateStatus: adminProcedure
      .input(UpdateVolunteerStatusSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // OWNERSHIP (#730): `getVolunteerById` is `*[_type == "volunteer" &&
          // _id == $id][0]` — an EXISTENCE check, not an ownership check. Any
          // tenant's volunteer application could be approved or rejected.
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
          const { volunteer, error: fetchError } = await getVolunteerById(
            input.volunteerId,
          )

          if (fetchError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch volunteer',
              cause: fetchError,
            })
          }

          if (!volunteer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Volunteer not found',
            })
          }

          const reviewerId = ctx.speaker._id
          const { success, error } = await updateVolunteerStatus(
            input.volunteerId,
            input.status,
            reviewerId,
            input.reviewNotes,
            volunteer.status === VolunteerStatus.CONFIRMED &&
              input.status === VolunteerStatus.APPROVED,
          )

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update volunteer status',
              cause: error,
            })
          }

          return { success }
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update volunteer status',
            cause: error,
          })
        }
      }),

    update: adminProcedure
      .input(UpdateVolunteerDetailsSchema)
      .mutation(async ({ input }) => {
        try {
          const { volunteerId, ...details } = input
          // OWNERSHIP (#730) — see `updateStatus` above. Guard FIRST: below
          // this, `getVolunteerById` is a global by-id read, so guarding after
          // it pulls another tenant's application into the request before
          // refusing to write it (#863).
          await requireDocumentInCurrentConference(volunteerId, 'volunteer')
          const { volunteer, error: fetchError } =
            await getVolunteerById(volunteerId)

          if (fetchError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch volunteer',
              cause: fetchError,
            })
          }

          if (!volunteer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Volunteer not found',
            })
          }

          const { success, error } = await updateVolunteerDetails(
            volunteerId,
            details,
          )

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update volunteer details',
              cause: error,
            })
          }

          return { success }
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update volunteer details',
            cause: error,
          })
        }
      }),

    sendEmail: adminProcedure
      .input(SendVolunteerEmailSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // OWNERSHIP (#858) — see `updateStatus` above. Unguarded, this read
          // any tenant's volunteer application and mailed its owner. It also
          // makes the `currentConf` fallback below SAFE BY CONSTRUCTION: the
          // volunteer's conference is now the request's conference, so the two
          // sides of that rebuilt object are the same document and cannot
          // disagree on venue, dates, reply address or links.
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
          const { volunteer, error: fetchError } = await getVolunteerById(
            input.volunteerId,
          )

          if (fetchError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch volunteer',
              cause: fetchError,
            })
          }

          if (!volunteer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Volunteer not found',
            })
          }

          if (
            volunteer.status !== VolunteerStatus.APPROVED &&
            volunteer.status !== VolunteerStatus.CONFIRMED
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Can only send approval emails to approved volunteers',
            })
          }

          let conferenceForEmail = volunteer.conference
          if (
            !conferenceForEmail ||
            (!conferenceForEmail.contactEmail && !conferenceForEmail.cfpEmail)
          ) {
            const { conference: currentConf, error: confError } =
              await getConferenceForCurrentDomain({
                includeVolunteerRegistrationLink: true,
              })
            if (confError || !currentConf) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to get conference',
                cause: confError,
              })
            }
            // SAME PRECEDENCE as `_id`/`title`: `organization` is the key
            // `resolveEmailSender` resolves the Resend account from, so every
            // defined field on `volunteer.conference` overrides `currentConf`
            // (#856, #858).
            const vc = volunteer.conference
            conferenceForEmail = {
              ...currentConf,
              ...Object.fromEntries(
                Object.entries(vc ?? {}).filter(
                  ([, v]) => v != null && v !== '',
                ),
              ),
              socialLinks: Array.isArray(currentConf.socialLinks)
                ? currentConf.socialLinks.map((link) =>
                    typeof link === 'string'
                      ? { platform: 'web', url: link }
                      : (link as { platform: string; url: string }),
                  )
                : [],
            }
          }

          const result = await sendVolunteerApprovalEmail(
            volunteer,
            conferenceForEmail,
            input.subject,
            input.message,
            {
              registrationUrl: input.ticketUrl,
              slackInviteUrl: input.slackInviteUrl,
            },
          )

          if (result.error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: result.error.error,
            })
          }

          let trackingRecorded = false
          if (ctx.speaker?._id) {
            const recordResult = await recordVolunteerApprovalEmailSent(
              input.volunteerId,
              ctx.speaker._id,
            )
            trackingRecorded = recordResult.success
            if (!recordResult.success) {
              console.error(
                'Failed to record volunteer approval email sent in Sanity:',
                recordResult.error,
              )
            }
          }

          return {
            success: true,
            emailId: result.data?.emailId,
            trackingRecorded,
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to send email',
            cause: error,
          })
        }
      }),

    sendBulkEmail: adminProcedure
      .input(SendVolunteerBulkEmailSchema)
      .mutation(async ({ input }) => {
        // OWNERSHIP: one query scoped to the current conference. Any id that
        // is not in it (another tenant's, or gone) refuses the whole batch.
        const conferenceId = await resolveConferenceId()
        const { volunteers, error } =
          await getVolunteersByConference(conferenceId)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch volunteers',
            cause: error,
          })
        }
        const byId = new Map(volunteers.map((v) => [v._id, v]))
        if (input.volunteerIds.some((id) => !byId.has(id))) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'One or more volunteers were not found',
          })
        }

        // Recipients come from the DB, deduped by email.
        const seen = new Set<string>()
        const recipients = input.volunteerIds
          .map((id) => byId.get(id)!)
          .filter((v) => {
            const key = v.email?.trim().toLowerCase()
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          })
        requireSenderAddress(recipients)

        const { sent, failed } = await sendEachVolunteer(recipients, (v) =>
          sendVolunteerApprovalEmail(
            v,
            v.conference,
            fillVolunteerName(input.subject, v.name),
            fillVolunteerName(
              input.message,
              v.name,
              input.message.trim().startsWith('['),
            ),
            {
              template: 'message',
              registrationUrl: null,
              slackInviteUrl: null,
              confirmUrl: null,
            },
          ),
        )
        console.log(
          `Volunteer bulk email: ${sent} sent, ${failed.length} failed (${conferenceId})`,
        )
        return {
          sent,
          failed,
          skipped: input.volunteerIds.length - recipients.length,
        }
      }),

    delete: adminProcedure
      .input(DeleteVolunteerSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730) — see `updateStatus` above. Unguarded, this
          // deleted any tenant's volunteer application. Guard FIRST: below
          // this, `getVolunteerById` is a global by-id read, so guarding after
          // it pulls another tenant's application into the request before
          // refusing to delete it (#863).
          await requireDocumentInCurrentConference(
            input.volunteerId,
            'volunteer',
          )
          const { volunteer, error: fetchError } = await getVolunteerById(
            input.volunteerId,
          )

          if (fetchError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch volunteer',
              cause: fetchError,
            })
          }

          if (!volunteer) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Volunteer not found',
            })
          }

          const { success, error } = await deleteVolunteer(input.volunteerId)

          if (error || !success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete volunteer',
              cause: error,
            })
          }

          return { success }
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete volunteer',
            cause: error,
          })
        }
      }),
  }),
})
