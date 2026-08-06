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
import { acceptedEd25519VerificationMethods } from '@/lib/badge/verification-method'
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
import { rebakeBadge } from '@/lib/badge/rebake'
import { isJWTFormat } from '@/lib/openbadges'
import { getSpeaker } from '@/lib/speaker/sanity'
import {
  getBadgeById,
  getBadgeForConference,
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
        // Legacy badge: badgeJson holds the RS256 JWT credential
        const { verifyCredentialJWT } = await import('@/lib/openbadges')
        const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY
        if (!publicKey) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Public key not configured',
          })
        }

        try {
          badgeAssertion = await verifyCredentialJWT(badge.badgeJson, publicKey)
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
        // Embedded Data Integrity Proof format (eddsa-rdfc-2022)
        //
        // Verify with OUR published Ed25519 public key; the secret seed is
        // never needed to verify. A missing key is config (not badge data), so
        // fail loudly (like the RSA path) rather than reporting the badge as
        // invalid.
        const publicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
        if (!publicKey) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Ed25519 issuer public key not configured',
          })
        }

        const verifiedAt = new Date().toISOString()
        try {
          const { verifyCredential, validateCredential } =
            await import('@/lib/openbadges')

          badgeAssertion = JSON.parse(badge.badgeJson)

          // Structural validity mirrors the REST verify route.
          const structurallyValid = validateCredential(badgeAssertion).valid

          let signatureValid = false
          if (badgeAssertion.proof && badgeAssertion.proof.length > 0) {
            // Pin the verification method to OUR issuer's embedded VM: a badge
            // with a foreign / did:key VM must not report as signature-valid.
            // Both the current dereferenceable keys URL and the legacy
            // issuer-profile fragment are accepted (previously baked SVGs).
            const issuerId =
              typeof badgeAssertion.issuer === 'object'
                ? badgeAssertion.issuer?.id
                : badgeAssertion.issuer
            const proofVm = badgeAssertion.proof[0]?.verificationMethod

            if (
              acceptedEd25519VerificationMethods(issuerId).includes(proofVm)
            ) {
              signatureValid = await verifyCredential(badgeAssertion, publicKey)
            }
          }

          return {
            valid: structurallyValid && signatureValid,
            signatureValid,
            credential: badgeAssertion,
            verifiedAt,
          }
        } catch {
          // Malformed badgeJson or a throwing verifyCredential (e.g. multiple
          // proofs, wrong type/cryptosuite) is a not-valid badge, not a 500.
          return {
            valid: false,
            signatureValid: false,
            credential: null,
            verifiedAt,
          }
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

    rebake: adminProcedure
      .input(BadgeIdInputSchema)
      .mutation(async ({ input }) => {
        // Org/tenant scope: resolveConferenceId() is the domain-authoritative
        // conference; rebakeBadge denies any badge that is not this conference's
        // (fail closed, mirrors the E11 badge gate).
        const conferenceId = await resolveConferenceId()
        const result = await rebakeBadge({
          badgeId: input.badgeId,
          conferenceId,
        })

        if (!result.success) {
          const code =
            result.reason === 'not_found'
              ? 'NOT_FOUND'
              : result.reason === 'forbidden'
                ? 'FORBIDDEN'
                : 'INTERNAL_SERVER_ERROR'
          throw new TRPCError({ code, message: result.error })
        }

        // Minimal payload: the client refetches the list; per-badge full
        // records would just add bulk-rebake bandwidth.
        return {
          success: true,
          badgeId: result.badge.badgeId,
          generatorVersion: result.badge.generatorVersion,
          message: 'Badge rebaked with the current generator',
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
          // OWNERSHIP (#863). This used the PUBLIC by-id lookup — no conference
          // predicate — and then mailed whichever speaker came back, so an
          // organizer of tenant A could trigger delivery to tenant B's speaker.
          // Its siblings `rebake` and `delete` were guarded; this one was not.
          //
          // The conference is resolved FIRST and the lookup itself carries the
          // predicate, so a foreign badge never enters this request: there is no
          // moment at which we hold another tenant's speaker's email address and
          // are relying on a later branch not to use it. It also removes the
          // existence oracle — a foreign badge id and a nonexistent one are the
          // same 'Badge not found'.
          //
          // It additionally makes the `conferenceData` fallback below SAFE BY
          // CONSTRUCTION: the badge is now guaranteed to belong to the request's
          // conference, so falling back to the domain conference cannot brand
          // one tenant's badge email with another tenant's identity.
          const conferenceId = await resolveConferenceId()
          const { badge, error } = await getBadgeForConference(
            input.badgeId,
            conferenceId,
          )

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

          // OWNERSHIP (#730): `getBadgeById` looks up by the PUBLIC `badgeId`
          // with no conference predicate. Already mitigated by the localhost
          // gate above, but the check belongs here rather than in the gate.
          const badgeConference = badge.conference as
            { _id?: string; _ref?: string } | undefined
          const badgeConferenceId =
            badgeConference?._id ?? badgeConference?._ref
          if (
            !badgeConferenceId ||
            badgeConferenceId !== (await resolveConferenceId())
          ) {
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
