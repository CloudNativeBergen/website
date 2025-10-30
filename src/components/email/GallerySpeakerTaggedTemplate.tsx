import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton } from './EmailComponents'

interface GallerySpeakerTaggedTemplateProps {
  speakerName: string
  imageUrl: string
  imageAlt?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  galleryUrl: string
  dashboardUrl: string
  socialLinks: string[]
}

export const GallerySpeakerTaggedTemplate: React.FC<
  GallerySpeakerTaggedTemplateProps
> = ({
  speakerName,
  imageUrl,
  imageAlt,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  galleryUrl,
  dashboardUrl,
  socialLinks,
}) => {
  return (
    <BaseEmailTemplate
      title={`You&apos;ve been tagged in a ${eventName} photo`}
      speakerName={speakerName}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
    >
      <div style={{ padding: '20px' }}>
        <table
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ marginBottom: '30px' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <img
                  src={imageUrl}
                  alt={imageAlt || `Gallery photo from ${eventName}`}
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    borderRadius: '8px',
                    display: 'block',
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <h2
          style={{
            marginBottom: '20px',
            textAlign: 'center',
            fontFamily:
              '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '24px',
            fontWeight: '600',
            color: '#1D4ED8',
          }}
        >
          You&apos;ve been tagged in a conference photo!
        </h2>

        <p
          style={{
            marginBottom: '20px',
            textAlign: 'center',
            fontSize: '15px',
            color: '#334155',
            lineHeight: '1.6',
          }}
        >
          Great news! You&apos;ve been tagged in a photo from {eventName}. This
          photo is now part of our conference gallery and helps showcase the
          amazing community and speakers at our event.
        </p>

        <p
          style={{
            marginBottom: '30px',
            textAlign: 'center',
            fontSize: '15px',
            color: '#334155',
            lineHeight: '1.6',
          }}
        >
          View the photo in our gallery or access your speaker dashboard to
          manage your profile and submissions.
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
                <table cellPadding="0" cellSpacing="0">
                  <tbody>
                    <tr>
                      <td style={{ paddingRight: '10px' }}>
                        <EmailButton href={galleryUrl}>View Image</EmailButton>
                      </td>
                      <td style={{ paddingLeft: '10px' }}>
                        <EmailButton href={dashboardUrl} variant="secondary">
                          Open Speaker Dashboard
                        </EmailButton>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
                <p
                  style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    textAlign: 'center',
                  }}
                >
                  You&apos;re receiving this email because you&apos;re a speaker
                  at {eventName}. If you believe you&apos;ve been tagged
                  incorrectly, please contact us.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseEmailTemplate>
  )
}
