import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton } from './EmailComponents'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'

interface CoSpeakerAddedTemplateProps {
  speakerName: string
  /** The organizer who created the profile, so the recipient knows who did. */
  organizerName: string
  /**
   * The "this is wrong" contact. The CONFERENCE address, never the organizer's
   * own login — a mistyped recipient must not receive somebody's auth identity.
   */
  contactEmail: string
  proposalTitle: string
  /** Where the recipient signs in to claim the profile. */
  dashboardUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  /** Tenant brand primary (THEMING L1); absent falls back to the house blue. */
  brandColor?: string
}

/**
 * NOT an invitation. The organizer has already added this person as a
 * co-speaker and created a profile for them — there is no token, nothing to
 * accept and nothing to decline. The email exists so nobody is put on a
 * programme without being told, and so a mistake has an obvious way back.
 */
export const CoSpeakerAddedTemplate: React.FC<CoSpeakerAddedTemplateProps> = ({
  speakerName,
  organizerName,
  contactEmail,
  proposalTitle,
  dashboardUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  brandColor,
}) => {
  const brand = resolveEmailBrandPalette(brandColor)
  return (
    <BaseEmailTemplate
      title={`You are now a co-speaker at ${eventName}`}
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
    >
      <div style={{ padding: '20px' }}>
        <h2
          style={{
            marginBottom: '20px',
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '24px',
            fontWeight: '600',
            color: brandedOr(brand, '#1D4ED8'),
          }}
        >
          You&apos;ve been added as a co-speaker
        </h2>

        <p
          style={{
            marginBottom: '20px',
            fontSize: '15px',
            color: '#334155',
            lineHeight: '1.6',
          }}
        >
          {organizerName} has added you as a co-speaker on{' '}
          <strong>&quot;{proposalTitle}&quot;</strong> for {eventName}, and
          created a speaker profile for you.
        </p>

        <p
          style={{
            marginBottom: '20px',
            fontSize: '15px',
            color: '#334155',
            lineHeight: '1.6',
          }}
        >
          You don&apos;t have to do anything — this is not an invitation, and
          there is nothing to accept. To take over the profile and edit it
          yourself, sign in with this email address.
        </p>

        <table
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ marginBottom: '30px' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <EmailButton href={dashboardUrl}>
                  Sign in to your profile
                </EmailButton>
              </td>
            </tr>
          </tbody>
        </table>

        <table
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{
            borderTop: '1px solid #e5e7eb',
            paddingTop: '20px',
            marginTop: '30px',
          }}
        >
          <tbody>
            <tr>
              <td>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>
                  If this is wrong — you are not part of this talk, or you
                  don&apos;t want to be listed — reply to this email or write to
                  the organizers at{' '}
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and we
                  will remove you.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseEmailTemplate>
  )
}
