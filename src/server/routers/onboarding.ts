import { TRPCError } from '@trpc/server'
import { z } from 'zod'
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
  buildPortalUrl,
} from '@/lib/sponsor-crm/onboarding'
import type { OnboardingSubmission } from '@/lib/sponsor-crm/onboarding'
import { logOnboardingComplete } from '@/lib/sponsor-crm/activity'
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
      const url = buildPortalUrl(baseUrl, token)

      return { token, url }
    }),

  sendPortalInvite: adminProcedure
    .input(
      z.object({
        sponsorForConferenceId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      // Fetch full sponsor + conference data for the email
      const sfc = await clientReadUncached.fetch<{
        _id: string
        onboardingToken: string | null
        onboardingComplete: boolean
        sponsor: { name: string }
        contactPersons: Array<{
          name: string
          email: string
          isPrimary?: boolean
        }> | null
        tier: { title: string } | null
        contractValue: number | null
        contractCurrency: string | null
        conference: {
          title: string
          city: string | null
          startDate: string | null
          organizer: string | null
          sponsorEmail: string | null
          socialLinks: string[] | null
          domains: string[] | null
        } | null
      }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{
          _id,
          onboardingToken,
          onboardingComplete,
          sponsor->{ name },
          contactPersons[]{ name, email, isPrimary },
          tier->{ title },
          contractValue,
          contractCurrency,
          conference->{
            title,
            city,
            startDate,
            organizer,
            sponsorEmail,
            "socialLinks": socialLinks[].url,
            domains
          }
        }`,
        { id: input.sponsorForConferenceId },
      )

      if (!sfc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Sponsor relationship not found',
        })
      }

      if (!sfc.conference) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Conference not found',
        })
      }

      const contacts = sfc.contactPersons || []
      const recipients = contacts.filter((c) => c.email).map((c) => c.email)

      if (recipients.length === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'No contact persons with email addresses. Add contacts first.',
        })
      }

      const domain = sfc.conference.domains?.[0]
      if (!domain) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Conference has no domain configured.',
        })
      }

      // Generate token if not already present
      let token = sfc.onboardingToken
      if (!token) {
        const result = await generateOnboardingToken(
          input.sponsorForConferenceId,
        )
        if (result.error || !result.token) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate onboarding token',
          })
        }
        token = result.token
      }

      const baseUrl = `https://${domain}`
      const portalUrl = buildPortalUrl(baseUrl, token)

      // Send email
      const { SponsorPortalInviteTemplate } =
        await import('@/components/email/SponsorPortalInviteTemplate')
      const { resend, retryWithBackoff } = await import('@/lib/email/config')
      const { formatConferenceDateLong } = await import('@/lib/time')
      const React = await import('react')

      const contractValueStr = sfc.contractValue
        ? `${sfc.contractValue.toLocaleString()} ${sfc.contractCurrency || 'NOK'}`
        : undefined

      const emailElement = React.createElement(SponsorPortalInviteTemplate, {
        sponsorName: sfc.sponsor.name,
        portalUrl,
        tierName: sfc.tier?.title,
        contractValue: contractValueStr,
        eventName: sfc.conference.title,
        eventLocation: sfc.conference.city || 'Norway',
        eventDate: sfc.conference.startDate
          ? formatConferenceDateLong(sfc.conference.startDate)
          : '',
        eventUrl: `https://${domain}`,
        socialLinks: sfc.conference.socialLinks || [],
      })

      const fromEmail =
        sfc.conference.sponsorEmail || 'sponsors@cloudnativeday.no'
      const fromName = sfc.conference.organizer || 'Cloud Native Days'

      const result = await retryWithBackoff(async () => {
        return resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: recipients,
          subject: `Sponsor Registration — ${sfc.conference!.title}`,
          react: emailElement,
        })
      })

      if (result.error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to send email: ${result.error.message}`,
        })
      }

      return {
        success: true,
        url: portalUrl,
        recipientCount: recipients.length,
      }
    }),
})
