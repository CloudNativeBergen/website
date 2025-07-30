import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface CoSpeakerInvitationTemplateProps {
  inviterName: string
  inviterEmail: string
  inviteeName: string
  proposalTitle: string
  proposalAbstract: string
  invitationUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  expiresAt: string
  socialLinks?: string[]
}

export function CoSpeakerInvitationTemplate({
  inviterName,
  inviterEmail,
  inviteeName,
  proposalTitle,
  proposalAbstract,
  invitationUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  expiresAt,
  socialLinks = [],
}: CoSpeakerInvitationTemplateProps) {
  const invitationSection = (
    <div style={{ marginBottom: '24px' }}>
      <EmailText>
        <strong>{inviterName}</strong> ({inviterEmail}) has invited you to join
        as a co-speaker for their proposal submitted to {eventName}.
      </EmailText>
      <EmailText size="14px" color="#1E40AF">
        As a co-speaker, you&apos;ll be listed on the proposal and can
        participate in presenting if the talk is accepted.
      </EmailText>
    </div>
  )

  const proposalSection = (
    <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
      <EmailSectionHeader>Proposal Details</EmailSectionHeader>
      <EmailText weight="600" size="18px">
        {proposalTitle}
      </EmailText>
      <div style={{ marginTop: '12px' }}>
        <EmailText size="14px" color="#64748B">
          <strong>Abstract:</strong>
        </EmailText>
        <EmailText size="14px" color="#475569">
          {proposalAbstract}
        </EmailText>
      </div>
    </EmailSection>
  )

  const whatNextSection = (
    <EmailSection backgroundColor="#F0F9FF" borderColor="#BAE6FD">
      <EmailSectionHeader color="#0284C7">
        What happens next?
      </EmailSectionHeader>
      <ul
        style={{
          margin: '0',
          paddingLeft: '20px',
          color: '#334155',
          fontSize: '14px',
          lineHeight: '1.6',
        }}
      >
        <li style={{ marginBottom: '8px' }}>
          Click the button below to view the full proposal details
        </li>
        <li style={{ marginBottom: '8px' }}>
          You can accept or decline the invitation on the response page
        </li>
        <li style={{ marginBottom: '8px' }}>
          If you accept, you&apos;ll be added as a co-speaker immediately
        </li>
        <li style={{ marginBottom: '0' }}>
          You&apos;ll receive updates about the proposal status via email
        </li>
      </ul>
    </EmailSection>
  )

  const customContent = {
    heading: 'Co-Speaker Invitation',
    body: (
      <>
        {invitationSection}
        {proposalSection}

        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            marginBottom: '24px',
          }}
        >
          <EmailButton href={invitationUrl}>View Invitation</EmailButton>
        </div>

        {whatNextSection}

        <EmailSection backgroundColor="#FEF3C7" borderColor="#FCD34D">
          <EmailText size="14px" color="#92400E">
            <strong>Note:</strong> This invitation link is unique to you and
            will expire on {expiresAt} or after you respond.
          </EmailText>
        </EmailSection>

        <EmailText size="14px" color="#64748B">
          If you have any questions about this invitation or the event, please
          contact the conference organizers.
        </EmailText>
      </>
    ),
  }

  return (
    <BaseEmailTemplate
      speakerName={inviteeName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={customContent}
    />
  )
}
