import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

interface ProposalAcceptTemplateProps {
  speakerName: string
  proposalTitle: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  confirmUrl: string
  comment?: string
  socialLinks?: string[]
}

export function ProposalAcceptTemplate({
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  confirmUrl,
  comment,
  socialLinks = [],
}: ProposalAcceptTemplateProps) {
  const congratsText = (
    <p
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '16px',
        marginTop: '0',
        color: '#334155',
      }}
    >
      Congratulations! We&apos;re excited to inform you that your proposal has
      been accepted for {eventName}.
    </p>
  )

  const footer = (
    <>
      {comment && (
        <EmailSection
          backgroundColor="#F0F9FF"
          borderColor="#BFDBFE"
          borderLeftColor="#1D4ED8"
        >
          <EmailSectionHeader>Message from the organizers:</EmailSectionHeader>
          <EmailText italic>{comment}</EmailText>
        </EmailSection>
      )}

      <EmailSection
        background="linear-gradient(135deg, #FACC15, #EAB308)"
        borderColor="#F59E0B"
      >
        <EmailSectionHeader color="#92400E">
          ⚠️ Action Required
        </EmailSectionHeader>
        <EmailText color="#92400E" weight="500">
          Please confirm your participation by clicking the button below:
        </EmailText>
      </EmailSection>

      <EmailButton href={confirmUrl}>Confirm Your Participation</EmailButton>

      <p
        style={{
          fontSize: '16px',
          color: '#334155',
          lineHeight: '1.6',
          marginBottom: '24px',
          marginTop: '0',
        }}
      >
        We look forward to your presentation at {eventName}!
      </p>
    </>
  )

  return (
    <BaseEmailTemplate
      title="🎉 Your proposal has been accepted!"
      titleColor="#1D4ED8"
      speakerName={speakerName}
      proposalTitle={proposalTitle}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      footer={footer}
    >
      {congratsText}
    </BaseEmailTemplate>
  )
}
