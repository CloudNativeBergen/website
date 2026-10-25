import React from 'react'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'

interface WorkshopCanceledTemplateProps {
  userName: string
  workshopTitle: string
  /** The sign-up's status: a confirmed seat or a place on the waitlist. */
  status: 'confirmed' | 'waitlist'
  /** The organizer's message, plain text. */
  message: string
  organizer: string
  contactEmail: string
  brandColor?: string
}

const text = {
  margin: '0 0 16px 0',
  fontSize: '16px',
  lineHeight: '24px',
  color: '#334155',
}

/**
 * A workshop the attendee signed up for was canceled or withdrawn. Sent by an
 * organizer from /admin/workshops, never automatically; attendee-facing, so
 * not the speaker BaseEmailTemplate.
 */
export const WorkshopCanceledTemplate: React.FC<
  WorkshopCanceledTemplateProps
> = ({
  userName,
  workshopTitle,
  status,
  message,
  organizer,
  contactEmail,
  brandColor,
}) => {
  const accent = brandedOr(resolveEmailBrandPalette(brandColor), '#1D4ED8')
  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
        backgroundColor: '#F9FAFB',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '40px',
        }}
      >
        <h2
          style={{
            margin: '0 0 8px 0',
            fontSize: '28px',
            fontWeight: 700,
            color: accent,
          }}
        >
          Workshop canceled
        </h2>
        <p style={{ ...text, margin: '0 0 24px 0', color: '#64748B' }}>
          {workshopTitle}
        </p>
        <p style={text}>Hi {userName},</p>
        <p style={text}>
          {status === 'confirmed'
            ? 'You had a seat in this workshop, which will no longer take place.'
            : 'You were on the waitlist for this workshop, which will no longer take place.'}
        </p>
        {message && (
          <div
            style={{
              backgroundColor: '#F1F5F9',
              borderLeft: `4px solid ${accent}`,
              padding: '16px 20px',
              margin: '0 0 24px 0',
              borderRadius: '4px',
            }}
          >
            <p style={{ ...text, margin: 0, whiteSpace: 'pre-line' }}>
              {message}
            </p>
          </div>
        )}
        <p style={{ ...text, fontSize: '14px', lineHeight: '20px' }}>
          If you have any questions, please contact us at{' '}
          <a
            href={`mailto:${contactEmail}`}
            style={{ color: accent, textDecoration: 'none' }}
          >
            {contactEmail}
          </a>
          .
        </p>
        <p style={{ ...text, margin: 0 }}>
          Best regards,
          <br />
          <strong>{organizer}</strong>
        </p>
      </div>
    </div>
  )
}
