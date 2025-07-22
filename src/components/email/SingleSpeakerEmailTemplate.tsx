import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface SingleSpeakerEmailTemplateProps {
  speakerName: string
  proposalTitle: string
  proposalUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  subject: string
  message: string
  senderName: string
  socialLinks?: string[]
}

export function SingleSpeakerEmailTemplate({
  speakerName,
  proposalTitle,
  proposalUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  message,
  senderName,
  socialLinks = [],
}: SingleSpeakerEmailTemplateProps) {
  const greeting = (
    <p
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '16px',
        marginTop: '0',
        color: '#334155',
      }}
    >
      Hi {speakerName},
    </p>
  )

  const proposalSection = (
    <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
      <EmailSectionHeader>Your Proposal</EmailSectionHeader>
      <EmailText weight="600">
        {proposalTitle}
      </EmailText>
      <EmailText size="14px" color="#64748B">
        Submitted for {eventName}
      </EmailText>
    </EmailSection>
  )

  const messageSection = message && (
    <EmailSection borderColor="#E5E7EB">
      <div
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: '#334155',
          marginBottom: '16px',
        }}
        dangerouslySetInnerHTML={{ __html: message.replace(/\n/g, '<br />') }}
      />
    </EmailSection>
  )

  const proposalLink = (
    <EmailSection borderColor="#E5E7EB">
      <EmailButton href={proposalUrl}>View Your Proposal</EmailButton>
    </EmailSection>
  )

  const footer = (
    <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
      <EmailText size="14px" color="#64748B">
        Best regards,
        <br />
        {senderName}
        <br />
        {eventName} Organizers
      </EmailText>
    </EmailSection>
  )

  return (
    <BaseEmailTemplate
      speakerName={speakerName}
      proposalTitle={proposalTitle}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
    >
      {greeting}
      {proposalSection}
      {messageSection}
      {proposalLink}
      {footer}
    </BaseEmailTemplate>
  )
}