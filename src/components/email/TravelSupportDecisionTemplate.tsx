import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton } from './EmailComponents'
import { brandedOr, resolveEmailBrandPalette } from '@/lib/branding/email'

interface TravelSupportDecisionTemplateProps {
  speakerName: string
  /** The decision, e.g. "Travel support approved" or "Expense rejected". */
  decision: string
  /** The organizer's review notes, when they wrote any. */
  notes?: string
  /** The speaker's travel support page. */
  travelSupportUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  brandColor?: string
}

/**
 * An organizer decided on the speaker's travel support request or one of its
 * expenses. Money decisions, so the speaker hears about them by email and not
 * only in the portal.
 */
export const TravelSupportDecisionTemplate: React.FC<
  TravelSupportDecisionTemplateProps
> = ({
  speakerName,
  decision,
  notes,
  travelSupportUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  brandColor,
}) => {
  const brand = resolveEmailBrandPalette(brandColor)
  const text = {
    marginBottom: '20px',
    fontSize: '15px',
    color: '#334155',
    lineHeight: '1.6',
  }
  return (
    <BaseEmailTemplate
      title={decision}
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
            fontSize: '24px',
            fontWeight: '600',
            color: brandedOr(brand, '#1D4ED8'),
          }}
        >
          {decision}
        </h2>
        <p style={text}>
          The organizers of {eventName} have updated your travel support.
        </p>
        {notes && (
          <p style={{ ...text, whiteSpace: 'pre-line' }}>
            <strong>Note from the organizers:</strong>
            <br />
            {notes}
          </p>
        )}
        <table
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ marginBottom: '30px' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <EmailButton href={travelSupportUrl}>
                  View your travel support
                </EmailButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseEmailTemplate>
  )
}
