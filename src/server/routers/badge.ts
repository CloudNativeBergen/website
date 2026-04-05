/**
 * Badge tRPC Router
 *
 * Handles badge issuance, management, and download operations
 * All endpoints are admin-only except for public verification
 */

import {
  router,
  adminProcedure,
  publicProcedure,
  resolveConferenceId,
} from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { isLocalhostEnvironment } from '@/lib/environment/localhost'
import {
  IssueBadgeInputSchema,
  BulkIssueBadgeInputSchema,
  ListBadgesInputSchema,
  BadgeIdInputSchema,
  ResendBadgeEmailInputSchema,
  DeleteBadgeInputSchema,
  ValidateBadgeInputSchema,
} from '@/server/schemas/badge'
import { issueBadgeForSpeaker } from '@/lib/badge/issuance'
import { isJWTFormat } from '@/lib/openbadges'
import { getSpeaker } from '@/lib/speaker/sanity'
import {
  getBadgeById,
  listBadgesForConference,
  listBadgesForSpeaker,
  deleteBadge,
} from '@/lib/badge/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const badgeRouter = router({
  verify: publicProcedure.input(BadgeIdInputSchema).query(async ({ input }) => {
    try {
      const { badge, error } = await getBadgeById(input.badgeId)

      if (error || !badge) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Badge not found',
        })
      }

      let badgeAssertion
      if (isJWTFormat(badge.badgeJson)) {
        // Decode JWT to get credential
        const { verifyCredentialJWT } = await import('@/lib/openbadges')
        const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY
        if (!publicKeyHex) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Public key not configured',
          })
        }

        try {
          badgeAssertion = await verifyCredentialJWT(
            badge.badgeJson,
            publicKeyHex,
          )
          // JWT verification succeeded
          return {
            valid: true,
            signatureValid: true,
            credential: badgeAssertion,
            verifiedAt: new Date().toISOString(),
          }
        } catch {
          return {
            valid: false,
            signatureValid: false,
            credential: null,
            verifiedAt: new Date().toISOString(),
          }
        }
      } else {
        // Legacy: Parse JSON (Data Integrity Proof format)
        badgeAssertion = JSON.parse(badge.badgeJson)

        const { verifyCredential } = await import('@/lib/openbadges')
        let signatureValid = false
        if (badgeAssertion.proof && badgeAssertion.proof.length > 0) {
          // Get public key from environment
          const publicKeyHex = process.env.BADGE_ISSUER_PUBLIC_KEY
          if (publicKeyHex) {
            signatureValid = await verifyCredential(
              badgeAssertion,
              publicKeyHex,
            )
          }
        }

        return {
          valid: true,
          signatureValid,
          credential: badgeAssertion,
          verifiedAt: new Date().toISOString(),
        }
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to verify badge',
        cause: error,
      })
    }
  }),

  admin: router({
    issue: adminProcedure
      .input(IssueBadgeInputSchema)
      .mutation(async ({ input, ctx }) => {
        const conferenceId = await resolveConferenceId()
        const isDevelopment = isLocalhostEnvironment()

        const result = await issueBadgeForSpeaker({
          speakerId: input.speakerId,
          badgeType: input.badgeType,
          centerGraphicSvg: input.centerGraphicSvg,
          conferenceId,
          currentUserEmail: ctx.user.email,
          isDevelopment,
        })

        if (!result.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          })
        }

        if (input.sendEmail !== false && !isDevelopment) {
          const { sendBadgeEmailWithRetry } = await import('@/lib/email/badge')
          const { conference } = await getConferenceForCurrentDomain()
          if (conference) {
            const conferenceYear = conference.startDate
              ? new Date(conference.startDate).getFullYear().toString()
              : new Date().getFullYear().toString()

            sendBadgeEmailWithRetry({
              badge: result.badge,
              speakerEmail: result.speakerEmail,
              speakerName: result.speakerName,
              conferenceName: conference.title,
              conferenceYear,
              conference,
            }).catch((err) => {
              console.error('Failed to send badge email:', err)
            })
          }
        }

        return {
          success: true,
          badge: result.badge,
          message: `Badge issued successfully to ${result.speakerName}`,
        }
      }),

    bulkIssue: adminProcedure
      .input(BulkIssueBadgeInputSchema)
      .mutation(async ({ input, ctx }) => {
        const conferenceId = await resolveConferenceId()
        const isDevelopment = isLocalhostEnvironment()
        const results: Array<{
          speakerId: string
          success: boolean
          error?: string
        }> = []

        for (const speakerId of input.speakerIds) {
          const result = await issueBadgeForSpeaker({
            speakerId,
            badgeType: input.badgeType,
            centerGraphicSvg: input.centerGraphicSvg,
            conferenceId,
            currentUserEmail: ctx.user.email,
            isDevelopment,
          })

          results.push({
            speakerId,
            success: result.success,
            error: result.success ? undefined : result.error,
          })
        }

        const successCount = results.filter((r) => r.success).length
        const failureCount = results.length - successCount

        return {
          success: true,
          results,
          summary: {
            total: results.length,
            successful: successCount,
            failed: failureCount,
          },
        }
      }),

    list: adminProcedure
      .input(ListBadgesInputSchema)
      .query(async ({ input }) => {
        try {
          if (input.speakerId) {
            const { badges, error } = await listBadgesForSpeaker(
              input.speakerId,
            )
            if (error) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to list badges',
                cause: error,
              })
            }
            return badges || []
          }

          const conferenceId = await resolveConferenceId()
          const { badges, error } = await listBadgesForConference(conferenceId)
          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list badges',
              cause: error,
            })
          }
          return badges || []
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list badges',
            cause: error,
          })
        }
      }),

    getById: adminProcedure
      .input(BadgeIdInputSchema)
      .query(async ({ input }) => {
        try {
          const { badge, error } = await getBadgeById(input.badgeId)

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch badge',
              cause: error,
            })
          }

          if (!badge) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Badge not found',
            })
          }

          return badge
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch badge',
            cause: error,
          })
        }
      }),

    resendEmail: adminProcedure
      .input(ResendBadgeEmailInputSchema)
      .mutation(async ({ input }) => {
        if (isLocalhostEnvironment()) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Email sending is disabled in development mode',
          })
        }

        try {
          const { badge, error } = await getBadgeById(input.badgeId)

          if (error || !badge) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Badge not found',
            })
          }

          let speakerData
          if (typeof badge.speaker === 'object' && 'email' in badge.speaker) {
            speakerData = badge.speaker
          } else {
            const speakerId =
              typeof badge.speaker === 'string'
                ? badge.speaker
                : badge.speaker._ref
            const { speaker: fetchedSpeaker, err: speakerFetchError } =
              await getSpeaker(speakerId)
            if (speakerFetchError || !fetchedSpeaker) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Speaker not found',
              })
            }
            speakerData = fetchedSpeaker
          }

          let conferenceData
          if (
            typeof badge.conference === 'object' &&
            'title' in badge.conference
          ) {
            conferenceData = badge.conference
          } else {
            const { conference: fetchedConference, error } =
              await getConferenceForCurrentDomain()
            if (error || !fetchedConference) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Conference not found',
              })
            }
            conferenceData = fetchedConference
          }

          const { sendBadgeEmailWithRetry } = await import('@/lib/email/badge')

          const result = await sendBadgeEmailWithRetry({
            badge,
            speakerEmail: speakerData.email,
            speakerName: speakerData.name,
            conferenceName: conferenceData.title,
            conferenceYear: new Date(conferenceData.startDate)
              .getFullYear()
              .toString(),
            conference: conferenceData,
          })

          if (!result.success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: result.error || 'Failed to send email',
            })
          }

          return {
            success: true,
            message: 'Email sent successfully',
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to resend email',
            cause: error,
          })
        }
      }),

    delete: adminProcedure
      .input(DeleteBadgeInputSchema)
      .mutation(async ({ input }) => {
        if (!isLocalhostEnvironment()) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Badge deletion is only allowed in development mode',
          })
        }

        try {
          const { badge, error: fetchError } = await getBadgeById(input.badgeId)

          if (fetchError || !badge) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Badge not found',
            })
          }

          const { success, error } = await deleteBadge(input.badgeId)

          if (!success || error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error?.message || 'Failed to delete badge',
              cause: error,
            })
          }

          return {
            success: true,
            message: `Badge ${input.badgeId} deleted successfully`,
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete badge',
            cause: error,
          })
        }
      }),

    validate: adminProcedure
      .input(ValidateBadgeInputSchema)
      .mutation(async ({ input }) => {
        try {
          const { validateBadge } = await import('@/lib/badge/validation')
          const result = await validateBadge(input.svg)

          return result
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              error instanceof Error ? error.message : 'Validation failed',
            cause: error,
          })
        }
      }),
  }),
})
