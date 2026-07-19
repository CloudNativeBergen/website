import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface MessageNotificationTemplateProps {
  recipientName: string
  authorName: string
  subject: string
  excerpt: string
  replyUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks?: string[]
}

/**
 * Speaker↔organizer new-message email (messaging M1). House style via
 * {@link BaseEmailTemplate}; the CTA deep-links straight into the thread.
 */
export function MessageNotificationTemplate({
  recipientName,
  authorName,
  subject,
  excerpt,
  replyUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: MessageNotificationTemplateProps) {
  const customContent = {
    heading: 'New message',
    body: (
      <>
        <div style={{ marginBottom: '24px' }}>
          <EmailText>
            <strong>{authorName}</strong> sent you a new message about{' '}
            <strong>&quot;{subject}&quot;</strong>.
          </EmailText>
        </div>

        <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
          <EmailSectionHeader>Message</EmailSectionHeader>
          <EmailText size="14px" color="#475569">
            {excerpt}
          </EmailText>
        </EmailSection>

        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            marginBottom: '24px',
          }}
        >
          <EmailButton href={replyUrl}>Reply in app</EmailButton>
        </div>

        <EmailText size="14px" color="#64748B">
          Prefer email? Replying to this email reaches the organizers by email,
          while replying in the app keeps the whole conversation in one place.
        </EmailText>

        <EmailText size="14px" color="#64748B">
          You can manage message emails for this conversation from its
          notification settings.
        </EmailText>
      </>
    ),
  }

  return (
    <BaseEmailTemplate
      speakerName={recipientName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={customContent}
    />
  )
}
