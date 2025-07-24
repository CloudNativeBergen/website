import { BaseEmailTemplate } from './BaseEmailTemplate'
import * as React from 'react'

interface BroadcastEmailTemplateProps {
  subject: string
  content: string
  recipientName?: string // Optional for general broadcasts
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  unsubscribeUrl?: string // Optional unsubscribe URL for Resend broadcasts
}

export const BroadcastEmailTemplate = ({
  subject,
  content,
  recipientName,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  unsubscribeUrl,
}: BroadcastEmailTemplateProps) => {
  // Email-safe list styles for bullets
  const emailContentStyle = {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#334155',
    marginBottom: '24px',
  }

  // Process content to add list styles for email clients
  const processedContent = content
    .replace(
      /<ul>/g,
      '<ul style="margin: 16px 0; padding-left: 20px; list-style-type: disc;">',
    )
    .replace(
      /<ol>/g,
      '<ol style="margin: 16px 0; padding-left: 20px; list-style-type: decimal;">',
    )
    .replace(/<li>/g, '<li style="margin-bottom: 8px; display: list-item;">')

  return (
    <BaseEmailTemplate
      title={subject}
      speakerName={recipientName}
      proposalTitle=""
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      unsubscribeUrl={unsubscribeUrl}
    >
      <div
        style={emailContentStyle}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    </BaseEmailTemplate>
  )
}
