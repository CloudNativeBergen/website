import * as React from 'react'
import { iconForLink, titleForLink } from '../SocialIcons'

interface BaseEmailTemplateProps {
  title?: string
  titleColor?: string
  speakerName: string
  proposalTitle?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  children?: React.ReactNode
  footer?: React.ReactNode
  customContent?: {
    heading?: string
    body?: React.ReactNode
  }
}

export function BaseEmailTemplate({
  title,
  titleColor = '#334155',
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  children,
  footer,
  customContent,
}: BaseEmailTemplateProps) {
  // Email-safe styles - using tables for layout and inline styles for maximum compatibility
  const containerStyle: React.CSSProperties = {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    lineHeight: '1.6',
    color: '#334155',
  }

  const headerStyle: React.CSSProperties = {
    color: titleColor,
    marginBottom: '24px',
    marginTop: '0',
    fontFamily:
      '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '28px',
    fontWeight: '700',
    lineHeight: '1.2',
  }

  const paragraphStyle: React.CSSProperties = {
    fontSize: '16px',
    lineHeight: '1.6',
    marginBottom: '16px',
    marginTop: '0',
    color: '#334155',
  }

  const eventDetailsStyle: React.CSSProperties = {
    backgroundColor: '#E0F2FE',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: '1px solid #CBD5E1',
  }

  const eventDetailsHeaderStyle: React.CSSProperties = {
    color: '#1D4ED8',
    marginTop: '0',
    marginBottom: '16px',
    fontFamily:
      '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
  }

  const listStyle: React.CSSProperties = {
    margin: '0',
    paddingLeft: '20px',
    color: '#334155',
    fontSize: '15px',
    lineHeight: '1.6',
  }

  const listItemStyle: React.CSSProperties = {
    marginBottom: '8px',
  }

  const linkStyle: React.CSSProperties = {
    color: '#1D4ED8',
    textDecoration: 'none',
    fontWeight: '500',
  }

  const footerStyle: React.CSSProperties = {
    backgroundColor: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    marginTop: '32px',
  }

  const footerTextStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#64748B',
    margin: '0',
    lineHeight: '1.5',
  }

  const hrStyle: React.CSSProperties = {
    border: 'none',
    borderTop: '1px solid #CBD5E1',
    margin: '32px 0',
  }

  const socialLinkStyle: React.CSSProperties = {
    color: '#1D4ED8',
    textDecoration: 'none',
    fontSize: '0', // Hide any text content
    marginRight: '12px',
    display: 'inline-block',
    padding: '4px',
  }

  const socialContainerStyle: React.CSSProperties = {
    textAlign: 'center' as const,
    marginBottom: '16px',
  }

  return (
    <div style={containerStyle}>
      {/* Use table for better email client compatibility */}
      <table
        role="presentation"
        style={{ width: '100%', borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            <td>
              <h1 style={headerStyle}>{customContent?.heading || title}</h1>

              <p style={paragraphStyle}>Dear {speakerName},</p>

              {customContent?.body ? (
                customContent.body
              ) : (
                <>
                  {proposalTitle && (
                    <p style={paragraphStyle}>
                      Thank you for submitting your proposal{' '}
                      <strong style={{ color: '#1D4ED8' }}>
                        &quot;{proposalTitle}&quot;
                      </strong>{' '}
                      for {eventName}.
                    </p>
                  )}

                  {children}
                </>
              )}

              {/* Event Details Section - only show if we have event info and not using custom content */}
              {!customContent && eventName && (
                <div style={eventDetailsStyle}>
                  <h3 style={eventDetailsHeaderStyle}>Event Details:</h3>
                  <ul style={listStyle}>
                    <li style={listItemStyle}>
                      <strong>Event:</strong> {eventName}
                    </li>
                    <li style={listItemStyle}>
                      <strong>Location:</strong> {eventLocation}
                    </li>
                    <li style={listItemStyle}>
                      <strong>Date:</strong> {eventDate}
                    </li>
                    <li style={{ marginBottom: '0' }}>
                      <strong>Website:</strong>{' '}
                      <a href={eventUrl} style={linkStyle}>
                        {eventUrl}
                      </a>
                    </li>
                  </ul>
                </div>
              )}

              {footer}

              <hr style={hrStyle} />

              {/* Social Links Section */}
              {socialLinks.length > 0 && (
                <div style={socialContainerStyle}>
                  <p
                    style={{
                      fontSize: '16px',
                      color: '#334155',
                      marginBottom: '12px',
                      marginTop: '0',
                      fontWeight: '600',
                    }}
                  >
                    Follow Cloud Native Bergen:
                  </p>
                  <div>
                    {socialLinks.map((link, index) => {
                      const iconElement = iconForLink(link, 'h-4 w-4')
                      const title = titleForLink(link)
                      return (
                        <a
                          key={index}
                          href={link}
                          style={socialLinkStyle}
                          title={title}
                          aria-label={title}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              width: '20px',
                              height: '20px',
                            }}
                          >
                            {iconElement}
                          </span>
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={footerStyle}>
                <p style={footerTextStyle}>
                  This email was sent by{' '}
                  <strong style={{ color: '#1D4ED8' }}>
                    Cloud Native Bergen
                  </strong>
                  .<br />
                  If you have any questions, please contact the organizers.
                </p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
