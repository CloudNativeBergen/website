import React from 'react'
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

export interface VolunteerApprovalTemplateProps {
  volunteerName: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  message: string
  socialLinks?: string[]
  /**
   * Tenant brand primary (THEMING L1). Resolved by the sender via
   * `emailBrandColor`; absent falls back to the house blue.
   */
  brandColor?: string
  /**
   * Dedicated registration link for volunteers to claim their ticket.
   */
  registrationUrl?: string
  /**
   * Slack invitation link for volunteers to join the community workspace.
   */
  slackInviteUrl?: string
}

export const VolunteerApprovalTemplate: React.FC<
  VolunteerApprovalTemplateProps
> = ({
  volunteerName,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  message,
  socialLinks = [],
  brandColor,
  registrationUrl,
  slackInviteUrl,
}) => {
  const brand = resolveEmailBrandPalette(brandColor)
  return (
    <BaseEmailTemplate
      title={`Welcome to the ${eventName} Volunteer Team!`}
      titleTone="brand"
      speakerName={volunteerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
    >
      <EmailText>
        Congratulations! Your volunteer application has been approved.
      </EmailText>

      {message && (
        <EmailSection
          backgroundColor={brandedTintOr(brand, '#E0F2FE')}
          borderColor="#CBD5E1"
          borderLeftColor={brandedOr(brand, '#1D4ED8')}
        >
          <EmailText>{message}</EmailText>
        </EmailSection>
      )}

      {registrationUrl && (
        <EmailSection
          backgroundColor={brandedTintOr(brand, '#E0F2FE')}
          borderColor="#CBD5E1"
          borderLeftColor={brandedOr(brand, '#1D4ED8')}
        >
          <EmailSectionHeader>
            🎟️ Volunteer Ticket Registration
          </EmailSectionHeader>
          <EmailText size="14px" color="#64748B">
            Please claim your complimentary volunteer ticket using the link below:
          </EmailText>
          <div style={{ marginTop: '16px' }}>
            <EmailButton href={registrationUrl}>
              Claim Your Volunteer Ticket
            </EmailButton>
          </div>
        </EmailSection>
      )}

      {slackInviteUrl && (
        <EmailSection
          backgroundColor={brandedTintOr(brand, '#E0F2FE')}
          borderColor="#CBD5E1"
          borderLeftColor={brandedOr(brand, '#1D4ED8')}
        >
          <EmailSectionHeader>
            💬 Join Our Slack Community
          </EmailSectionHeader>
          <EmailText size="14px" color="#64748B">
            Join our Slack workspace to coordinate with the organizer team and fellow volunteers:
          </EmailText>
          <div style={{ marginTop: '16px' }}>
            <EmailButton href={slackInviteUrl}>
              Join Volunteer Slack
            </EmailButton>
          </div>
        </EmailSection>
      )}

      <EmailSectionHeader>Next Steps</EmailSectionHeader>
      <EmailText>
        • Check your email regularly for further instructions and updates
      </EmailText>
      <EmailText>
        • Contact the organizers if you have any questions or concerns
      </EmailText>
      <EmailText>• Please arrive on time on the event day</EmailText>

      <EmailText>
        Thank you for volunteering to help make {eventName} a success! We look
        forward to working with you.
      </EmailText>

      <EmailButton href={eventUrl}>Visit Event Website</EmailButton>
    </BaseEmailTemplate>
  )
}
