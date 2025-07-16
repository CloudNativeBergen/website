import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailSection, EmailSectionHeader, EmailText } from './EmailComponents'

interface ProposalRejectTemplateProps {
  speakerName: string
  proposalTitle: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  comment?: string
  socialLinks?: string[]
}

export function ProposalRejectTemplate({
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  comment,
  socialLinks = [],
}: ProposalRejectTemplateProps) {
  const decisionText = (
    <p
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '24px',
        marginTop: '0',
        color: '#334155',
      }}
    >
      After careful consideration, we regret to inform you that we won't be able
      to include your proposal in this year's program. This decision was
      difficult to make given the high quality of submissions we received.
    </p>
  )

  const footer = (
    <>
      {comment && (
        <EmailSection
          backgroundColor="#FEF2F2"
          borderColor="#FECACA"
          borderLeftColor="#EF4444"
        >
          <EmailSectionHeader color="#DC2626">
            Feedback from the organizers:
          </EmailSectionHeader>
          <EmailText italic>{comment}</EmailText>
        </EmailSection>
      )}

      <EmailSection
        background="linear-gradient(135deg, #10B981, #059669)"
        borderColor="#10B981"
      >
        <EmailSectionHeader color="white">💡 Keep in touch!</EmailSectionHeader>
        <EmailText color="white">
          We encourage you to submit proposals for future events and stay
          connected with the Cloud Native Bergen community.
        </EmailText>
      </EmailSection>

      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          marginBottom: '16px',
          marginTop: '0',
          color: '#334155',
        }}
      >
        We appreciate your interest in contributing to our community and hope to
        see you at future events.
      </p>

      <p
        style={{
          fontSize: '16px',
          color: '#334155',
          lineHeight: '1.6',
          marginBottom: '24px',
          marginTop: '0',
        }}
      >
        Best regards,
        <br />
        <strong style={{ color: '#1D4ED8' }}>
          The Cloud Native Bergen Team
        </strong>
      </p>
    </>
  )

  return (
    <BaseEmailTemplate
      title="Thank you for your proposal submission"
      titleColor="#334155"
      speakerName={speakerName}
      proposalTitle={proposalTitle}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      footer={footer}
    >
      {decisionText}
    </BaseEmailTemplate>
  )
}
