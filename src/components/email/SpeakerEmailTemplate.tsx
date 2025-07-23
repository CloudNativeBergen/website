import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface SpeakerEmailTemplateProps {
  speakers: Array<{
    name: string
    email: string
  }>
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

export function SpeakerEmailTemplate({
  speakers,
  proposalTitle,
  proposalUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  subject,
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  senderName,
  socialLinks = [],
}: SpeakerEmailTemplateProps) {
  const proposalSection = (
    <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
      <EmailSectionHeader>Your Proposal</EmailSectionHeader>
      <EmailText weight="600">{proposalTitle}</EmailText>
      <EmailText size="14px" color="#64748B">
        Submitted for {eventName}
      </EmailText>
      {speakers.length > 1 && (
        <>
          <div style={{ marginTop: '8px' }}>
            <EmailText size="14px" color="#64748B">
              <strong>All speakers:</strong>
            </EmailText>
          </div>
          <ul
            style={{
              margin: '4px 0 0 0',
              paddingLeft: '16px',
              color: '#64748B',
              fontSize: '14px',
            }}
          >
            {speakers.map((speaker, index) => (
              <li key={index} style={{ marginBottom: '2px' }}>
                {speaker.name} ({speaker.email})
              </li>
            ))}
          </ul>
        </>
      )}
    </EmailSection>
  )

  const messageSection = message && (
    <div
      style={{
        fontSize: '16px',
        lineHeight: '1.6',
        color: '#334155',
        marginBottom: '24px',
      }}
    >
      {message.split('\n').map((line, index) => (
        <p
          key={index}
          style={{
            margin: 0,
            marginBottom: index < message.split('\n').length - 1 ? '16px' : 0,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  )

  const proposalLink = (
    <div
      style={{ textAlign: 'center', marginTop: '24px', marginBottom: '24px' }}
    >
      <EmailButton href={proposalUrl}>View Your Proposal</EmailButton>
    </div>
  )

  return (
    <BaseEmailTemplate
      title={subject}
      // Remove speakerName prop since greeting is now in the message
      proposalTitle={undefined} // Don't show default proposal text since message includes greeting
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        body: (
          <>
            {messageSection}
            {proposalSection}
            {proposalLink}
          </>
        ),
      }}
    />
  )
}
