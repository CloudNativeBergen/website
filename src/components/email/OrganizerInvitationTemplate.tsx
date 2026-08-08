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

export interface OrganizerInvitationTemplateProps {
  inviterName: string
  inviterEmail: string
  inviteeName: string
  /** The address the invitation was sent to — restated so the recipient knows
   *  which mailbox they must sign in with. */
  invitedEmail: string
  invitationUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  expiresAt: string
  socialLinks?: string[]
  /** Tenant brand primary (THEMING L1); absent falls back to the house blue. */
  brandColor?: string
}

export function OrganizerInvitationTemplate({
  inviterName,
  inviterEmail,
  inviteeName,
  invitedEmail,
  invitationUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  expiresAt,
  socialLinks = [],
  brandColor,
}: OrganizerInvitationTemplateProps) {
  const brand = resolveEmailBrandPalette(brandColor)

  const invitationSection = (
    <div style={{ marginBottom: '24px' }}>
      <EmailText>
        <strong>{inviterName}</strong> ({inviterEmail}) has invited you to join
        the organizer team for {eventName}.
      </EmailText>
      <EmailText size="14px" color={brandedOr(brand, '#1E40AF')}>
        Organizers get full access to the event admin area — reviewing
        proposals, managing speakers and sponsors, and the schedule.
      </EmailText>
    </div>
  )

  const howToAcceptSection = (
    <EmailSection
      backgroundColor={brandedTintOr(brand, '#F0F9FF')}
      borderColor={brandedTintOr(brand, '#BAE6FD')}
    >
      <EmailSectionHeader color={brandedOr(brand, '#0284C7')}>
        How to accept
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
          Open the link below and sign in with <strong>{invitedEmail}</strong>{' '}
          using the &quot;email me a sign-in link&quot; option.
        </li>
        <li style={{ marginBottom: '8px' }}>
          Signing in to that address is what proves the invitation reached the
          right person — the link on its own is not enough.
        </li>
        <li style={{ marginBottom: '0' }}>
          Once you accept, admin access appears the next time your session
          refreshes.
        </li>
      </ul>
    </EmailSection>
  )

  const customContent = {
    heading: 'Organizer Invitation',
    body: (
      <>
        {invitationSection}

        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            marginBottom: '24px',
          }}
        >
          <EmailButton href={invitationUrl}>Review invitation</EmailButton>
        </div>

        {howToAcceptSection}

        <EmailSection backgroundColor="#FEF3C7" borderColor="#FCD34D">
          <EmailText size="14px" color="#92400E">
            <strong>Note:</strong> This invitation expires on {expiresAt}. It
            can only be accepted by someone who can receive mail at{' '}
            {invitedEmail}, so forwarding it does not pass the invitation on.
          </EmailText>
        </EmailSection>

        <EmailText size="14px" color="#64748B">
          If you were not expecting this, you can ignore this message — nothing
          happens until the invitation is accepted.
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
      customContent={customContent}
    />
  )
}
