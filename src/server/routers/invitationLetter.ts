import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '../trpc'
import { IssueInvitationLetterSchema } from '../schemas/invitationLetter'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { buildInvitationLetterContent } from '@/lib/invitation-letter/content'
import { generateInvitationLetterPdf } from '@/lib/invitation-letter/pdf'
import {
  generateLetterReference,
  invitationLetterFilename,
  recordInvitationLetter,
  listInvitationLetters,
} from '@/lib/invitation-letter/sanity'
import { sendInvitationLetterEmail } from '@/lib/email/invitation-letter'
import { getCurrentDateTime } from '@/lib/time'

/**
 * Visa invitation letters, issued by an organizer on behalf of the conference.
 *
 * The organizer collects the applicant's passport details out of band (email,
 * a form, however the request arrived) and types them in here. This resolver
 * renders them into a PDF and lets them go: nothing in the input beyond the
 * applicant's name and email is persisted, and the PDF itself is never stored,
 * because it carries the same data. See `sanity/schemaTypes/invitationLetter`.
 *
 * Nothing in this file may log the input. An error path that dumps `input` for
 * debugging would put a passport number in the application logs, which is the
 * one outcome this design exists to prevent.
 */
export const invitationLetterRouter = router({
  issue: adminProcedure
    .input(IssueInvitationLetterSchema)
    .mutation(async ({ input, ctx }) => {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resolve the conference for this domain',
        })
      }

      if (!conference.organizer?.trim()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'The conference has no organizer name set. A letter of invitation must name the legal entity issuing it — set it under conference settings first.',
        })
      }

      const issuedAt = getCurrentDateTime()
      const reference = generateLetterReference(issuedAt)

      const content = buildInvitationLetterContent({
        details: {
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth,
          nationality: input.nationality,
          passportNumber: input.passportNumber,
          passportExpiry: input.passportExpiry,
          gender: input.gender,
          residentialAddress: input.residentialAddress,
          phone: input.phone,
          email: input.email,
          organization: input.organization,
          jobTitle: input.jobTitle,
          role: input.role,
          registrationReference: input.registrationReference,
          arrivalDate: input.arrivalDate,
          departureDate: input.departureDate,
          addressedTo: input.addressedTo,
          costCoverage: input.costCoverage,
          additionalNotes: input.additionalNotes,
        },
        conference,
        signatory: {
          name: ctx.speaker.name,
          title: input.signatoryTitle,
          email: conference.contactEmail,
          signatureDataUrl: input.signatureDataUrl,
        },
        reference,
        issuedAt,
      })

      let pdf: Buffer
      try {
        pdf = await generateInvitationLetterPdf(content, conference.logoBright)
      } catch (error) {
        // Deliberately logs the reference, never the applicant details.
        console.error('[invitationLetter] PDF generation failed', {
          reference,
          error: error instanceof Error ? error.message : String(error),
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate the invitation letter PDF',
        })
      }

      const filename = invitationLetterFilename(reference, input.fullName)

      let emailedTo: string | undefined
      let emailError: string | undefined
      if (input.delivery !== 'download' && input.email) {
        const result = await sendInvitationLetterEmail({
          conference,
          to: input.email,
          recipientName: input.fullName,
          reference,
          pdf,
          filename,
        })

        if (result.success) {
          emailedTo = input.email
        } else {
          // A failed send must not lose the letter: the PDF still comes back so
          // the organizer can forward it themselves.
          emailError = result.error ?? 'Unknown email error'
          console.error('[invitationLetter] Email delivery failed', {
            reference,
            error: emailError,
          })
        }
      }

      const { error: auditError } = await recordInvitationLetter({
        conferenceId: conference._id,
        reference,
        recipientName: input.fullName,
        recipientEmail: input.email,
        participantRole: input.role,
        issuedById: ctx.speaker._id,
        issuedAt,
        emailedTo,
      })

      if (auditError) {
        // The letter exists whether or not the audit write succeeded; losing the
        // letter over a bookkeeping failure would be the worse outcome.
        console.error('[invitationLetter] Audit write failed', {
          reference,
          error: auditError.message,
        })
      }

      // Withhold the PDF only when the email actually went out: it carries the
      // same passport data the rest of this feature refuses to keep, so it
      // should not travel further than it must. But a failed send MUST return
      // it — nothing is stored, so losing it here would cost the applicant a
      // full re-entry of their passport details.
      const needsPdf = input.delivery !== 'email' || !emailedTo

      return {
        reference,
        filename,
        pdfBase64: needsPdf ? pdf.toString('base64') : undefined,
        emailedTo,
        emailError,
        auditRecorded: !auditError,
      }
    }),

  list: adminProcedure.query(async () => {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError || !conference) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve the conference for this domain',
      })
    }

    const { letters, error } = await listInvitationLetters(conference._id)

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list issued invitation letters',
        cause: error,
      })
    }

    return letters ?? []
  }),
})
