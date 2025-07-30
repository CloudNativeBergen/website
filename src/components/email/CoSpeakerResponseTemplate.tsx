import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'

export interface CoSpeakerResponseTemplateProps {
  inviterName: string
  respondentName: string
  respondentEmail: string
  proposalTitle: string
  proposalUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  accepted: boolean
  declineReason?: string
  socialLinks?: string[]
}

export function CoSpeakerResponseTemplate({
  inviterName,
  respondentName,
  respondentEmail,
  proposalTitle,
  proposalUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  accepted,
  declineReason,
  socialLinks = [],
}: CoSpeakerResponseTemplateProps) {
  const responseSection = accepted ? (
    <div style={{ marginBottom: '24px' }}>
      <EmailText>
        <strong>{respondentName}</strong> ({respondentEmail}) has accepted your
        invitation to be a co-speaker for your proposal.
      </EmailText>
      <EmailText size="14px" color="#15803D">
        They are now listed as a co-speaker on your proposal and can view all
        proposal details.
      </EmailText>
    </div>
  ) : (
    <div style={{ marginBottom: '24px' }}>
      <EmailText>
        <strong>{respondentName}</strong> ({respondentEmail}) has declined your
        invitation to be a co-speaker for your proposal.
      </EmailText>
      {declineReason && (
        <div style={{ marginTop: '12px' }}>
          <EmailText size="14px" color="#991B1B">
            <strong>Reason provided:</strong>
          </EmailText>
          <EmailText size="14px" color="#7F1D1D" italic>
            &quot;{declineReason}&quot;
          </EmailText>
        </div>
      )}
    </div>
  )

  const proposalSection = (
    <EmailSection backgroundColor="#F8FAFC" borderColor="#E5E7EB">
      <EmailSectionHeader>Your Proposal</EmailSectionHeader>
      <EmailText weight="600">{proposalTitle}</EmailText>
      <EmailText size="14px" color="#64748B">
        Submitted for {eventName}
      </EmailText>
    </EmailSection>
  )

  const nextStepsSection = accepted ? (
    <EmailSection backgroundColor="#F0F9FF" borderColor="#BAE6FD">
      <EmailSectionHeader color="#0284C7">Next Steps</EmailSectionHeader>
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
          Your co-speaker has been added to the proposal
        </li>
        <li style={{ marginBottom: '8px' }}>
          They will receive email notifications about the proposal status
        </li>
        <li style={{ marginBottom: '8px' }}>
          You can both manage the proposal from your speaker dashboards
        </li>
        <li style={{ marginBottom: '0' }}>
          Consider coordinating with your co-speaker on the presentation
        </li>
      </ul>
    </EmailSection>
  ) : (
    <EmailSection backgroundColor="#F0F9FF" borderColor="#BAE6FD">
      <EmailSectionHeader color="#0284C7">What&apos;s Next?</EmailSectionHeader>
      <EmailText size="14px">
        You can still invite other co-speakers to your proposal if needed. Visit
        your proposal page to send additional invitations.
      </EmailText>
    </EmailSection>
  )

  const customContent = {
    heading: accepted
      ? 'Co-Speaker Invitation Accepted'
      : 'Co-Speaker Invitation Declined',
    body: (
      <>
        {responseSection}
        {proposalSection}

        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            marginBottom: '24px',
          }}
        >
          <EmailButton href={proposalUrl}>View Your Proposal</EmailButton>
        </div>

        {nextStepsSection}

        <EmailText size="14px" color="#64748B">
          If you have any questions about managing co-speakers or your proposal,
          please contact the event organizers.
        </EmailText>
      </>
    ),
  }

  return (
    <BaseEmailTemplate
      titleColor={accepted ? '#15803D' : '#991B1B'}
      speakerName={inviterName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={customContent}
    />
  )
}
