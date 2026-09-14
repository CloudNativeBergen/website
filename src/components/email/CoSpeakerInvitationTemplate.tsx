import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import {
  EmailSection,
  EmailSectionHeader,
  EmailText,
  EmailButton,
} from './EmailComponents'
import {
  brandedOr,
  brandedTintOr,
  resolveEmailBrandPalette,
} from '@/lib/branding/email'

/**
 * Which of the three things this email is. Mirrors `InvitationEmailVariant` in
 * `@/lib/cospeaker/server` — declared here so the template does not pull a
 * server module into the email render.
 */
export type CoSpeakerInvitationVariant = 'invitation' | 'reminder' | 'renewed'

export interface CoSpeakerInvitationTemplateProps {
  /** Defaults to first contact, which is what every existing caller sends. */
  variant?: CoSpeakerInvitationVariant
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
  /**
   * Tenant brand primary (THEMING L1). Resolved by the sender via
   * `emailBrandColor`; absent falls back to the house blue.
   */
  brandColor?: string
}

export function CoSpeakerInvitationTemplate({
  variant = 'invitation',
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
  brandColor,
}: CoSpeakerInvitationTemplateProps) {
  const brand = resolveEmailBrandPalette(brandColor)

  const leadByVariant = {
    invitation: (
      <EmailText>
        <strong>{inviterName}</strong> ({inviterEmail}) has invited you to join
        as a co-speaker for their proposal submitted to {eventName}.
      </EmailText>
    ),
    reminder: (
      <EmailText>
        This is a reminder. <strong>{inviterName}</strong> ({inviterEmail})
        invited you to join as a co-speaker on a proposal submitted to{' '}
        {eventName}, and the invitation is still waiting for your answer.
      </EmailText>
    ),
    renewed: (
      <EmailText>
        Your earlier invitation from <strong>{inviterName}</strong> (
        {inviterEmail}) expired before you answered it. The link below is a new
        one, and it replaces the old link.
      </EmailText>
    ),
  }

  const invitationSection = (
    <div style={{ marginBottom: '24px' }}>
      {leadByVariant[variant]}
      <EmailText size="14px" color={brandedOr(brand, '#1E40AF')}>
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
    <EmailSection
      backgroundColor={brandedTintOr(brand, '#F0F9FF')}
      borderColor={brandedTintOr(brand, '#BAE6FD')}
    >
      <EmailSectionHeader color={brandedOr(brand, '#0284C7')}>
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
          Use the button above to view the full proposal details
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

  const headingByVariant = {
    invitation: 'Co-Speaker Invitation',
    reminder: 'Reminder: Co-Speaker Invitation',
    renewed: 'Your Co-Speaker Invitation Has a New Link',
  }

  const customContent = {
    heading: headingByVariant[variant],
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
            <strong>Note:</strong> This link is unique to you and stops working
            on {expiresAt}, or as soon as you respond. If you do nothing, the
            invitation lapses on that date and you will not be listed on the
            proposal.
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
      brandColor={brandColor}
      showMessagesLink
      customContent={customContent}
    />
  )
}
