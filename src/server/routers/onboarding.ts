import { TRPCError } from '@trpc/server'
import { router, publicProcedure, adminProcedure } from '../trpc'
import {
  OnboardingTokenSchema,
  OnboardingSubmissionSchema,
  GenerateOnboardingTokenSchema,
} from '../schemas/onboarding'
import {
  validateOnboardingToken,
  completeOnboarding,
  generateOnboardingToken,
  buildOnboardingUrl,
} from '@/lib/sponsor-crm/onboarding'
import type { OnboardingSubmission } from '@/lib/sponsor-crm/onboarding'
import { logOnboardingComplete } from '@/lib/sponsor-crm/activity'
import { generateAndSendContract } from '@/lib/sponsor-crm/contract-send'
import { clientReadUncached } from '@/lib/sanity/client'

export const onboardingRouter = router({
  validate: publicProcedure
    .input(OnboardingTokenSchema)
    .query(async ({ input }) => {
      const { sponsor, error } = await validateOnboardingToken(input.token)

      if (error || !sponsor) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error?.message || 'Invalid onboarding token',
        })
      }

      return sponsor
    }),

  complete: publicProcedure
    .input(OnboardingSubmissionSchema)
    .mutation(async ({ input }) => {
      const { token, ...data } = input

      const { success, sponsorForConferenceId, error } =
        await completeOnboarding(token, data as OnboardingSubmission)

      if (error || !success) {
        throw new TRPCError({
          code: error?.message.includes('already been completed')
            ? 'CONFLICT'
            : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to complete onboarding',
        })
      }

      if (sponsorForConferenceId) {
        try {
          await logOnboardingComplete(sponsorForConferenceId, 'system')
        } catch (logError) {
          console.error('Failed to log onboarding completion:', logError)
        }

        // Auto-generate and send contract for digital signing
        try {
          const contractResult = await generateAndSendContract(
            sponsorForConferenceId,
            { actorId: 'system' },
          )
          if (!contractResult.success) {
            console.error(
              'Auto-contract send failed after onboarding:',
              contractResult.error,
            )
          }
        } catch (contractError) {
          console.error('Auto-contract send error:', contractError)
        }
      }

      return { success: true }
    }),

  generateToken: adminProcedure
    .input(GenerateOnboardingTokenSchema)
    .mutation(async ({ input }) => {
      const { token, error } = await generateOnboardingToken(
        input.sponsorForConferenceId,
      )

      if (error || !token) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to generate onboarding token',
        })
      }

      const sfc = await clientReadUncached.fetch<{
        domain: string | null
      }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{
          "domain": conference->domains[0]
        }`,
        { id: input.sponsorForConferenceId },
      )

      if (!sfc?.domain) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Conference has no domain configured. Set a domain on the conference before generating a portal link.',
        })
      }

      const baseUrl = `https://${sfc.domain}`
      const url = buildOnboardingUrl(baseUrl, token)

      return { token, url }
    }),
})
