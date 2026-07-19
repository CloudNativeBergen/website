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
  /**
   * Whether the recipient is an organizer. Organizers get organizer-phrased copy
   * (replies land in the CFP inbox, not the conversation) and a `/admin`
   * replyUrl; speakers get speaker-phrased copy (replies reach the organizers'
   * shared inbox).
   */
  isOrganizer?: boolean
  /**
   * Whether this is a speaker's FIRST contact in a thread (S9c) — an organizer
   * opening a conversation. Renders a warmer heading + intro. Only ever set for
   * a speaker recipient.
   */
  firstContact?: boolean
  /** Absolute link to the recipient's notification preferences (cfp profile). */
  preferencesUrl?: string
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
  isOrganizer = false,
  firstContact = false,
  preferencesUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks = [],
}: MessageNotificationTemplateProps) {
  const customContent = {
    heading: firstContact
      ? `The ${eventName} organizers reached out`
      : 'New message',
    body: (
      <>
        <div style={{ marginBottom: '24px' }}>
          <EmailText>
            {firstContact ? (
              <>
                The <strong>{eventName}</strong> organizers have started a
                conversation with you about{' '}
                <strong>&quot;{subject}&quot;</strong>.
              </>
            ) : (
              <>
                <strong>{authorName}</strong> sent you a new message about{' '}
                <strong>&quot;{subject}&quot;</strong>.
              </>
            )}
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

        {/* S9a: truthful reply-fallback copy. There is no Reply-To / inbound
            handler, so a reply never reaches the conversation — it lands in the
            CFP inbox that organizers read. */}
        <EmailText size="14px" color="#64748B">
          {isOrganizer
            ? 'Replies to this email land in the CFP inbox, not the conversation. Reply in the app to post to the thread.'
            : "Replying to this email reaches the organizers' shared inbox — for the full conversation, reply in the app."}
        </EmailText>

        {/* S9b: describe what the link actually opens — the GLOBAL message-email
            setting on your profile — with no per-conversation promise. */}
        <EmailText size="14px" color="#64748B">
          The link below opens the global message-email setting on your profile.{' '}
          {preferencesUrl && (
            <a
              href={preferencesUrl}
              style={{ color: '#2563EB', textDecoration: 'underline' }}
            >
              Manage notification preferences
            </a>
          )}
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
