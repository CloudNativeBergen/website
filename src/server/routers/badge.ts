/**
 * Badge tRPC Router
 *
 * Handles badge issuance, management, and download operations
 * All endpoints are admin-only except for public verification
 */

import { router, adminProcedure, publicProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import {
  IssueBadgeInputSchema,
  BulkIssueBadgeInputSchema,
  ListBadgesInputSchema,
  BadgeIdInputSchema,
  ResendBadgeEmailInputSchema,
  DeleteBadgeInputSchema,
} from '@/server/schemas/badge'
import { generateBadgeCredential } from '@/lib/badge/generator'
import { createBadgeConfiguration } from '@/lib/badge/config'
import { generateBadgeSVG } from '@/lib/badge/svg'
import { bakeBadge, isJWTFormat } from '@/lib/openbadges'
import { formatConferenceDateForBadge, getCurrentDateTime } from '@/lib/time'
import { getSpeaker } from '@/lib/speaker/sanity'
import {
  createBadge,
  getBadgeById,
  listBadgesForConference,
  listBadgesForSpeaker,
  uploadBadgeSVGAsset,
  checkBadgeExists,
  deleteBadge,
} from '@/lib/badge/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

/**
 * Check if running in development/localhost mode
 */
function isLocalhostEnvironment(): boolean {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
  return (
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1') ||
    process.env.NODE_ENV === 'development'
  )
}

export const badgeRouter = router({
  /**
   * Issue a single badge
   */
  issue: adminProcedure
    .input(IssueBadgeInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { exists, badge: existingBadge } = await checkBadgeExists(
          input.speakerId,
          input.conferenceId,
          input.badgeType,
        )

        if (exists && existingBadge) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Badge already issued for this speaker/conference/type combination',
          })
        }

        const { speaker, err: speakerError } = await getSpeaker(input.speakerId)
        if (speakerError || !speaker) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Speaker not found',
          })
        }

        if (isLocalhostEnvironment()) {
          const currentUserEmail = ctx.user.email
          if (speaker.email !== currentUserEmail) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `Development mode: You can only issue badges to yourself (${currentUserEmail}). Attempted to issue to ${speaker.email}.`,
            })
          }
        }

        if (input.badgeType === 'organizer' && !speaker.is_organizer) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot issue organizer badge to ${speaker.name}: only organizers are eligible for organizer badges.`,
          })
        }

        if (input.badgeType === 'speaker') {
          const { clientReadUncached } = await import('@/lib/sanity/client')
          const hasAcceptedTalk = await clientReadUncached.fetch(
            `count(*[_type == "talk" &&
              references($speakerId) &&
              references($conferenceId) &&
              status in ["accepted", "confirmed"]
            ]) > 0`,
            { speakerId: speaker._id, conferenceId: input.conferenceId },
          )

          if (!hasAcceptedTalk) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot issue speaker badge to ${speaker.name}: only speakers with accepted or confirmed talks are eligible.`,
            })
          }
        }

        const { conference, domain, error } =
          await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found',
          })
        }

        // Verify the conference matches the requested conferenceId
        if (conference._id !== input.conferenceId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference ID does not match current domain',
          })
        }

        const conferenceYear = conference.start_date
          ? new Date(conference.start_date).getFullYear().toString()
          : new Date().getFullYear().toString()

        const conferenceDate = conference.start_date
          ? formatConferenceDateForBadge(conference.start_date)
          : 'TBD'

        // Create badge configuration with keys and URLs
        const config = await createBadgeConfiguration(conference, domain)

        // Fetch accepted talk for evidence (speaker badges only)
        let talkId: string | undefined
        let talkTitle: string | undefined
        if (input.badgeType === 'speaker') {
          const { clientReadUncached } = await import('@/lib/sanity/client')
          const acceptedTalk = await clientReadUncached.fetch<{
            _id: string
            title: string
          } | null>(
            `*[_type == "talk" &&
              references($speakerId) &&
              references($conferenceId) &&
              status in ["accepted", "confirmed"]
            ][0]{_id, title}`,
            { speakerId: speaker._id, conferenceId: input.conferenceId },
          )
          if (acceptedTalk) {
            talkId = acceptedTalk._id
            talkTitle = acceptedTalk.title
          }
        }

        const { assertion, badgeId } = await generateBadgeCredential(
          {
            speakerId: speaker._id,
            speakerName: speaker.name,
            speakerEmail: speaker.email,
            speakerSlug: speaker.slug,
            conferenceId: conference._id,
            conferenceTitle: conference.title,
            conferenceYear,
            conferenceDate,
            badgeType: input.badgeType,
            centerGraphicSvg: input.centerGraphicSvg,
            talkId,
            talkTitle,
          },
          config,
        )

        const svgContent = generateBadgeSVG({
          conferenceTitle: conference.title,
          conferenceYear,
          conferenceDate,
          badgeType: input.badgeType,
          centerGraphicSvg: input.centerGraphicSvg,
        })

        const verificationUrl = `${config.baseUrl}/api/badge/${badgeId}/verify`
        const bakedSvg = bakeBadge(svgContent, assertion)

        const { assetId, error: uploadError } = await uploadBadgeSVGAsset(
          bakedSvg,
          `badge-${speaker.name.replace(/\s+/g, '-').toLowerCase()}-${badgeId}.svg`,
        )

        if (uploadError || !assetId) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to upload badge SVG',
            cause: uploadError,
          })
        }

        const { badge, error: createError } = await createBadge({
          badgeId,
          speakerId: speaker._id,
          conferenceId: conference._id,
          badgeType: input.badgeType,
          issuedAt: getCurrentDateTime(),
          badgeJson: assertion, // Store JWT string directly
          bakedSvgAssetId: assetId,
          verificationUrl,
        })

        if (createError || !badge) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create badge record',
            cause: createError,
          })
        }

        // Skip email sending in development mode
        if (input.sendEmail !== false && !isLocalhostEnvironment()) {
          const { sendBadgeEmailWithRetry } = await import('@/lib/email/badge')
          sendBadgeEmailWithRetry({
            badge,
            speakerEmail: speaker.email,
            speakerName: speaker.name,
            conferenceName: conference.title,
            conferenceYear,
            conference,
          }).catch((err) => {
            console.error('Failed to send badge email:', err)
          })
        }

        return {
          success: true,
          badge,
          message: `Badge issued successfully to ${speaker.name}`,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to issue badge',
          cause: error,
        })
      }
    }),

  /**
   * Issue badges in bulk
   */
  bulkIssue: adminProcedure
    .input(BulkIssueBadgeInputSchema)
    .mutation(async ({ input, ctx }) => {
      const results: Array<{
        speakerId: string
        success: boolean
        error?: string
      }> = []
      const isDevelopment = isLocalhostEnvironment()
      const currentUserEmail = ctx.user.email

      for (const speakerId of input.speakerIds) {
        try {
          const { exists } = await checkBadgeExists(
            speakerId,
            input.conferenceId,
            input.badgeType,
          )

          if (exists) {
            results.push({
              speakerId,
              success: false,
              error: 'Badge already exists',
            })
            continue
          }

          const { speaker, err: speakerError } = await getSpeaker(speakerId)
          if (speakerError || !speaker) {
            results.push({
              speakerId,
              success: false,
              error: 'Speaker not found',
            })
            continue
          }

          if (isDevelopment && speaker.email !== currentUserEmail) {
            results.push({
              speakerId,
              success: false,
              error: `Development mode: Can only issue to yourself (${currentUserEmail})`,
            })
            continue
          }

          if (input.badgeType === 'organizer' && !speaker.is_organizer) {
            results.push({
              speakerId,
              success: false,
              error:
                'Not eligible: Only organizers can receive organizer badges',
            })
            continue
          }

          if (input.badgeType === 'speaker') {
            const { clientReadUncached } = await import('@/lib/sanity/client')
            const hasAcceptedTalk = await clientReadUncached.fetch(
              `count(*[_type == "talk" &&
                references($speakerId) &&
                references($conferenceId) &&
                status in ["accepted", "confirmed"]
              ]) > 0`,
              { speakerId: speaker._id, conferenceId: input.conferenceId },
            )

            if (!hasAcceptedTalk) {
              results.push({
                speakerId,
                success: false,
                error:
                  'Not eligible: Only speakers with accepted/confirmed talks',
              })
              continue
            }
          }

          const { conference, domain, error } =
            await getConferenceForCurrentDomain()
          if (error || !conference) {
            results.push({
              speakerId,
              success: false,
              error: 'Conference not found',
            })
            continue
          }

          // Verify the conference matches the requested conferenceId
          if (conference._id !== input.conferenceId) {
            results.push({
              speakerId,
              success: false,
              error: 'Conference ID does not match current domain',
            })
            continue
          }

          const conferenceYear = conference.start_date
            ? new Date(conference.start_date).getFullYear().toString()
            : new Date().getFullYear().toString()

          const conferenceDate = conference.start_date
            ? formatConferenceDateForBadge(conference.start_date)
            : 'TBD'

          // Create badge configuration with keys and URLs
          const config = await createBadgeConfiguration(conference, domain)

          // Fetch accepted talk for evidence (speaker badges only)
          let talkId: string | undefined
          let talkTitle: string | undefined
          if (input.badgeType === 'speaker') {
            const { clientReadUncached } = await import('@/lib/sanity/client')
            const acceptedTalk = await clientReadUncached.fetch<{
              _id: string
              title: string
            } | null>(
              `*[_type == "talk" &&
                references($speakerId) &&
                references($conferenceId) &&
                status in ["accepted", "confirmed"]
              ][0]{_id, title}`,
              { speakerId: speaker._id, conferenceId: input.conferenceId },
            )
            if (acceptedTalk) {
              talkId = acceptedTalk._id
              talkTitle = acceptedTalk.title
            }
          }

          const { assertion, badgeId } = await generateBadgeCredential(
            {
              speakerId: speaker._id,
              speakerName: speaker.name,
              speakerEmail: speaker.email,
              speakerSlug: speaker.slug,
              conferenceId: conference._id,
              conferenceTitle: conference.title,
              conferenceYear,
              conferenceDate,
              badgeType: input.badgeType,
              centerGraphicSvg: input.centerGraphicSvg,
              talkId,
              talkTitle,
            },
            config,
          )

          const svgContent = generateBadgeSVG({
            conferenceTitle: conference.title,
            conferenceYear,
            conferenceDate,
            badgeType: input.badgeType,
            centerGraphicSvg: input.centerGraphicSvg,
          })

          const verificationUrl = `${config.baseUrl}/api/badge/${badgeId}/verify`
          const bakedSvg = bakeBadge(svgContent, assertion)

          const { assetId, error: uploadError } = await uploadBadgeSVGAsset(
            bakedSvg,
            `badge-${speaker.name.replace(/\s+/g, '-').toLowerCase()}-${badgeId}.svg`,
          )

          if (uploadError || !assetId) {
            results.push({
              speakerId,
              success: false,
              error: 'Failed to upload SVG',
            })
            continue
          }

          const { error: createError } = await createBadge({
            badgeId,
            speakerId: speaker._id,
            conferenceId: conference._id,
            badgeType: input.badgeType,
            issuedAt: getCurrentDateTime(),
            badgeJson: assertion, // Store JWT string directly
            bakedSvgAssetId: assetId,
            verificationUrl,
          })

          if (createError) {
            results.push({
              speakerId,
              success: false,
              error: 'Failed to create badge record',
            })
            continue
          }

          results.push({ speakerId, success: true })
        } catch (error) {
          results.push({
            speakerId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
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

  /**
   * List badges
   */
  list: adminProcedure.input(ListBadgesInputSchema).query(async ({ input }) => {
    try {
      if (input.conferenceId) {
        const { badges, error } = await listBadgesForConference(
          input.conferenceId,
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

      if (input.speakerId) {
        const { badges, error } = await listBadgesForSpeaker(input.speakerId)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list badges',
            cause: error,
          })
        }
        return badges || []
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Either conferenceId or speakerId must be provided',
      })
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list badges',
        cause: error,
      })
    }
  }),

  /**
   * Get badge by ID
   */
  getById: adminProcedure.input(BadgeIdInputSchema).query(async ({ input }) => {
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

  /**
   * Resend badge email
   */
  resendEmail: adminProcedure
    .input(ResendBadgeEmailInputSchema)
    .mutation(async ({ input }) => {
      // Skip email sending in development mode
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
          conferenceYear: new Date(conferenceData.start_date)
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

  /**
   * Verify badge signature (public endpoint)
   */
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
      if (isJWTFormat(badge.badge_json)) {
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
            badge.badge_json,
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
        badgeAssertion = JSON.parse(badge.badge_json)

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

  /**
   * Delete a badge (development mode only)
   */
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
})
