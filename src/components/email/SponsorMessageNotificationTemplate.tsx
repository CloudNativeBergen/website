import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface SponsorMessageNotificationTemplateProps {
  /** The contact person this copy is addressed to. */
  recipientName: string
  /** The organizer who wrote the message. */
  authorName: string
  /** Thread subject (the sponsor company name). */
  subject: string
  /** Excerpt of the message body. */
  excerpt: string
  /** Absolute portal deep link (`…/sponsor/portal/<token>#messages`). */
  portalUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

/**
 * Organizer→sponsor new-message email (messaging G2b). Sent to every contact
 * person from the conference `sponsorEmail` from-address when an ORGANIZER posts
 * into a sponsor thread; the reply link is the sponsor PORTAL (`#messages`), the
 * sponsor's only messaging surface. Mirrors the compact
 * `SponsorPortalInviteTemplate` styling for a consistent sponsor-email look.
 */
export function SponsorMessageNotificationTemplate({
  recipientName,
  authorName,
  subject,
  excerpt,
  portalUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: SponsorMessageNotificationTemplateProps) {
  const textStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '1.6',
    marginBottom: '16px',
    marginTop: '0',
    color: '#334155',
  }

  return (
    <BaseEmailTemplate
      title={`New message about ${subject}`}
      titleColor="#1D4ED8"
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        heading: `New message from the ${eventName} organizers`,
        body: (
          <>
            <p style={textStyle}>Hi {recipientName},</p>
            <p style={textStyle}>
              <strong>{authorName}</strong> sent your team a message about your
              sponsorship of {eventName}.
            </p>

            <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
              <EmailSectionHeader>Message</EmailSectionHeader>
              <EmailText>{excerpt}</EmailText>
            </EmailSection>

            <p style={textStyle}>
              Open your sponsor portal to read the full thread and reply.
            </p>

            <EmailButton href={portalUrl}>View &amp; reply</EmailButton>
          </>
        ),
      }}
    />
  )
}
