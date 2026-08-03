import { resend } from '@/lib/email/config'
import { resolveConferenceFrom } from '@/lib/email/from'
import { escapeHtml } from '@/lib/email/escape'
import type { Conference } from '@/lib/conference/types'

interface SendInvitationLetterEmailParams {
  conference: Conference
  to: string
  recipientName: string
  reference: string
  /** The rendered letter. Attached, never stored. */
  pdf: Buffer
  filename: string
}

/**
 * Emails the letter to the applicant as a PDF attachment.
 *
 * The attachment is built from the buffer the caller just rendered — we never
 * write the PDF anywhere, because it carries the same passport data the rest of
 * this feature deliberately refuses to keep.
 */
export async function sendInvitationLetterEmail({
  conference,
  to,
  recipientName,
  reference,
  pdf,
  filename,
}: SendInvitationLetterEmailParams): Promise<{
  success: boolean
  emailId?: string
  error?: string
}> {
  try {
    const from = resolveConferenceFrom(conference, {
      field: 'contactEmail',
      localPart: 'contact',
    })

    const response = await resend.emails.send({
      from,
      to,
      subject: `Letter of invitation — ${conference.title}`,
      html: `
        <p>Dear ${escapeHtml(recipientName)},</p>
        <p>
          Please find your letter of invitation for
          ${escapeHtml(conference.title)} attached. Its reference is
          <strong>${escapeHtml(reference)}</strong>.
        </p>
        <p>
          The letter supports your visa application. It is not a guarantee that
          a visa will be granted — that decision rests entirely with the
          consulate handling your application.
        </p>
        <p>
          If anything in the letter is wrong, reply to this email and we will
          issue a corrected one.
        </p>
        <p>Kind regards,<br />${escapeHtml(conference.organizer || conference.title)}</p>
      `,
      attachments: [{ filename, content: pdf.toString('base64') }],
    })

    if (response.error) {
      return { success: false, error: response.error.message }
    }

    return { success: true, emailId: response.data?.id }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
