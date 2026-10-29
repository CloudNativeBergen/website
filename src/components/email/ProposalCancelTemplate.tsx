import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailSection, EmailSectionHeader, EmailText } from './EmailComponents'
import { ProposalRejectTemplateProps } from '@/lib/proposal'

/**
 * Sent when an ORGANIZER cancels (accepted/confirmed) or withdraws a talk and
 * chose to notify the speaker. One template for both: the only difference the
 * speaker needs to see is the verb.
 */
export function ProposalCancelTemplate({
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  comment,
  socialLinks = [],
  brandColor,
  withdrawn = false,
}: ProposalRejectTemplateProps & { withdrawn?: boolean }) {
  const footer = comment ? (
    <EmailSection
      backgroundColor="#FEF2F2"
      borderColor="#FECACA"
      borderLeftColor="#EF4444"
    >
      <EmailSectionHeader color="#DC2626">
        Message from the organizers:
      </EmailSectionHeader>
      <EmailText italic>{comment}</EmailText>
    </EmailSection>
  ) : undefined

  return (
    <BaseEmailTemplate
      title={
        withdrawn
          ? 'Your talk has been withdrawn'
          : 'Your talk has been canceled'
      }
      titleColor="#334155"
      speakerName={speakerName}
      proposalTitle={proposalTitle}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
      showMessagesLink
      footer={footer}
    >
      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          marginBottom: '24px',
          marginTop: '0',
          color: '#334155',
        }}
      >
        The organizers have {withdrawn ? 'withdrawn' : 'canceled'} your talk, so
        it is no longer part of the {eventName} program. If you have questions,
        reply to this email or send the organizers a message.
      </p>
    </BaseEmailTemplate>
  )
}
