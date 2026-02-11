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

      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || 'https://cloudnativebergen.no'
      const url = buildOnboardingUrl(baseUrl, token)

      return { token, url }
    }),
})
