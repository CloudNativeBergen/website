import { TRPCError } from '@trpc/server'
import { router, publicProcedure, adminProcedure } from '../trpc'
import {
  RegistrationTokenSchema,
  RegistrationSubmissionSchema,
  GenerateRegistrationTokenSchema,
} from '../schemas/registration'
import {
  validateRegistrationToken,
  completeRegistration,
  generateRegistrationToken,
  buildPortalUrl,
  getSfcForNotification,
} from '@/lib/sponsor-crm/registration'
import type { RegistrationSubmission } from '@/lib/sponsor-crm/registration'
import { logRegistrationComplete } from '@/lib/sponsor-crm/activity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { requireDocumentInCurrentConference } from '../tenancy'
import { notifySponsorRegistrationComplete } from '@/lib/slack/notify'
import { sanitizeSvgFieldOrThrow, SvgSanitizeError } from '@/lib/svg/upload'

export const registrationRouter = router({
  validate: publicProcedure
    .input(RegistrationTokenSchema)
    .query(async ({ input }) => {
      const { sponsor, error } = await validateRegistrationToken(input.token)

      if (error || !sponsor) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error?.message || 'Invalid registration token',
        })
      }

      return sponsor
    }),

  complete: publicProcedure
    .input(RegistrationSubmissionSchema)
    .mutation(async ({ input }) => {
      const { token, ...data } = input

      // Public, token-gated path — the sponsor uploads their own logo, so the
      // SVG is untrusted. Sanitize SERVER-SIDE (the client pass is bypassable)
      // before it is stored. A hard rejection surfaces as BAD_REQUEST.
      try {
        const logo = sanitizeSvgFieldOrThrow(data.logo)
        if (!logo) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A valid company logo (SVG) is required.',
          })
        }
        data.logo = logo
        if ('logoBright' in data) {
          data.logoBright =
            sanitizeSvgFieldOrThrow(data.logoBright) ?? undefined
        }
      } catch (svgError) {
        if (svgError instanceof SvgSanitizeError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: svgError.message,
          })
        }
        throw svgError
      }

      const { success, sponsorForConferenceId, error } =
        await completeRegistration(token, data as RegistrationSubmission)

      if (error || !success) {
        const isConflict = error?.message.includes('already been completed')
        if (!isConflict) {
          console.error(
            '[registration.complete] Registration failed:',
            error?.message,
          )
        }
        throw new TRPCError({
          code: isConflict ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
          message:
            error?.message ||
            'Failed to complete registration. Please try again.',
        })
      }

      if (sponsorForConferenceId) {
        try {
          await logRegistrationComplete(sponsorForConferenceId, 'system')
        } catch (logError) {
          console.error('Failed to log registration completion:', logError)
        }

        // Send Slack notification to sales channel
        try {
          const sfcData = await getSfcForNotification(sponsorForConferenceId)

          if (sfcData?.conference) {
            await notifySponsorRegistrationComplete(
              sfcData.sponsorName,
              sfcData.tierTitle,
              sfcData.contractValue,
              sfcData.contractCurrency,
              sfcData.conference,
            )
          }
        } catch (slackError) {
          console.error('Failed to send Slack notification:', slackError)
        }
      }

      return { success: true }
    }),

  generateToken: adminProcedure
    .input(GenerateRegistrationTokenSchema)
    .mutation(async ({ input }) => {
      // OWNERSHIP (#730): the id is client input and the returned token is a
      // BEARER credential for the sponsor portal — unguarded, an organizer of
      // tenant A could mint a working portal token for tenant B's sponsor and
      // then read and rewrite that sponsor's data through the public
      // `validate`/`complete` endpoints.
      await requireDocumentInCurrentConference(
        input.sponsorForConferenceId,
        'sponsorForConference',
      )
      const { token, error } = await generateRegistrationToken(
        input.sponsorForConferenceId,
      )

      if (error || !token) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: error?.message || 'Failed to generate registration token',
        })
      }

      const { domain } = await getConferenceForCurrentDomain()
      if (!domain) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Conference has no domain configured. Set a domain on the conference before generating a portal link.',
        })
      }

      const baseUrl = `https://${domain}`
      const url = buildPortalUrl(baseUrl, token)

      return { token, url }
    }),
})
