import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, publicProcedure, adminProcedure } from '../trpc'
import { isLocalhostDomain } from '@/lib/environment/localhost'
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
} from '@/lib/sponsor-crm/registration'
import type { RegistrationSubmission } from '@/lib/sponsor-crm/registration'
import {
  logRegistrationComplete,
  logEmailSent,
  logContractStatusChange,
} from '@/lib/sponsor-crm/activity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { notifySponsorRegistrationComplete } from '@/lib/slack/notify'
import type { Conference } from '@/lib/conference/types'

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
          const sfcData = await clientReadUncached.fetch<{
            sponsorName: string
            tierTitle: string | null
            contractValue: number | null
            contractCurrency: string | null
            conference: Conference | null
          }>(
            `*[_type == "sponsorForConference" && _id == $id][0]{
              "sponsorName": sponsor->name,
              "tierTitle": tier->title,
              contractValue,
              contractCurrency,
              "conference": conference->{
                _id, title, city, country, startDate, endDate,
                organizer, salesNotificationChannel, domains,
                socialLinks
              }
            }`,
            { id: sponsorForConferenceId },
          )

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
      const { token, error } = await generateRegistrationToken(
        input.sponsorForConferenceId,
      )

      if (error || !token) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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

  sendPortalInvite: adminProcedure
    .input(
      z.object({
        sponsorForConferenceId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Fetch full sponsor + conference data for the email
      const sfc = await clientReadUncached.fetch<{
        _id: string
        status: string | null
        registrationToken: string | null
        registrationComplete: boolean
        contractStatus: string | null
        sponsor: { name: string } | null
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
        } | null
      }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{
          _id,
          status,
          registrationToken,
          registrationComplete,
          contractStatus,
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
            socialLinks
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

      if (!sfc.sponsor?.name) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Sponsor information is missing. Link a sponsor to this relationship before sending a portal invite.',
        })
      }

      if (sfc.status !== 'closed-won') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Registration emails can only be sent to sponsors with a won deal. Move the sponsor to Closed Won first.',
        })
      }

      const contacts = sfc.contactPersons || []
      const recipients = Array.from(
        new Set(
          contacts
            .map((c) => c.email?.trim())
            .filter((email): email is string => Boolean(email)),
        ),
      )

      if (recipients.length === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'No contact persons with email addresses. Add contacts first.',
        })
      }

      const { domain: currentDomain } = await getConferenceForCurrentDomain()
      if (!currentDomain) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Conference has no domain configured.',
        })
      }

      if (isLocalhostDomain(currentDomain)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Registration emails cannot be sent from localhost. Deploy to a production domain first.',
        })
      }

      // Generate token if not already present
      let token = sfc.registrationToken
      if (!token) {
        const result = await generateRegistrationToken(
          input.sponsorForConferenceId,
        )
        if (result.error || !result.token) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate registration token',
          })
        }
        token = result.token
      }

      const baseUrl = `https://${currentDomain}`
      const portalUrl = buildPortalUrl(baseUrl, token)

      // Send email
      const { SponsorPortalInviteTemplate } =
        await import('@/components/email/SponsorPortalInviteTemplate')
      const { resend, retryWithBackoff } = await import('@/lib/email/config')
      const { formatConferenceDateLong } = await import('@/lib/time')
      const React = await import('react')

      const { formatNumber } = await import('@/lib/format')
      const contractValueStr = sfc.contractValue
        ? `${formatNumber(sfc.contractValue)} ${sfc.contractCurrency || 'NOK'}`
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
        eventUrl: `https://${currentDomain}`,
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

      // Update contract status to 'registration-sent' if not already further along
      const oldContractStatus = sfc.contractStatus || 'none'
      const advancedStatuses = [
        'registration-sent',
        'contract-sent',
        'contract-signed',
      ]
      if (!advancedStatuses.includes(oldContractStatus)) {
        try {
          await clientWrite
            .patch(input.sponsorForConferenceId)
            .set({ contractStatus: 'registration-sent' })
            .commit()

          await logContractStatusChange(
            input.sponsorForConferenceId,
            oldContractStatus,
            'registration-sent',
            ctx.speaker._id,
          )
        } catch (statusError) {
          console.error(
            'Failed to update contract status to registration-sent:',
            statusError,
          )
        }
      }

      // Log email activity
      try {
        await logEmailSent(
          input.sponsorForConferenceId,
          `Sponsor Registration — ${sfc.conference!.title}`,
          ctx.speaker._id,
        )
      } catch (logError) {
        console.error('Failed to log portal invite activity:', logError)
      }

      return {
        success: true,
        url: portalUrl,
        recipientCount: recipients.length,
      }
    }),
})
