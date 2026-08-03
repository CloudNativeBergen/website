import * as React from 'react'
import { iconForLink, titleForLink } from '../SocialIcons'

import { DEFAULT_PRIMARY_COLOR } from '@/lib/branding/theme'
import { resolveEmailBrandPalette } from '@/lib/branding/email'
import { EmailBrandProvider } from './EmailBrandContext'

/**
 * The default brand PRIMARY (Cloud Native Days blue) — re-exported from the
 * theming core so the email default can never drift from the house palette.
 * Overridable per-send via `brandColor` so a tenant's mail can carry its own
 * primary. The base template's footer already names the sender via `eventName`,
 * so no hardcoded brand name remains.
 */
export const DEFAULT_EMAIL_BRAND_COLOR = DEFAULT_PRIMARY_COLOR

/** The neutral slate an email H1 uses when it is not a brand-toned heading. */
const NEUTRAL_TITLE_COLOR = '#334155'

interface BaseEmailTemplateProps {
  title?: string
  /**
   * Explicit H1 colour. Prefer `titleTone` — a literal here cannot follow the
   * tenant, which is exactly how every template ended up hard-coding the house
   * blue.
   */
  titleColor?: string
  /**
   * Whether this email's H1 is a brand-toned heading (`brand`) or neutral body
   * slate (`neutral`, the default).
   *
   * This is a two-value enum rather than "default the title to the brand
   * colour" on purpose: the templates genuinely disagree — roughly half opened
   * with a coloured heading and half with slate — and collapsing them would
   * have changed what unthemed tenants receive. `brand` reproduces the old
   * `#1D4ED8` literal exactly when there is no theme.
   */
  titleTone?: 'neutral' | 'brand'
  /** Accent colour for links, the event-details header and footer emphasis. */
  brandColor?: string
  speakerName?: string
  proposalTitle?: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  children?: React.ReactNode
  footer?: React.ReactNode
  unsubscribeUrl?: string
  /**
   * When true, append ONE muted line pointing speakers at the on-site Messages
   * inbox (adoption, V2e). Opt-in per template so it only rides speaker-facing
   * transactional emails (proposal decisions, co-speaker) and never sponsor /
   * contract / attendee mail. The URL is derived from `eventUrl` so no call site
   * needs to build it: this line is defined ONCE here, not per template.
   */
  showMessagesLink?: boolean
  customContent?: {
    heading?: string
    body?: React.ReactNode
  }
}

/**
 * The conference Messages inbox URL, derived from the template's `eventUrl`
 * (which is sometimes a bare domain, sometimes `https://domain`, occasionally
 * with a trailing slash). Normalise all three to `https://<domain>/cfp/messages`.
 */
function messagesUrlFromEventUrl(eventUrl: string): string {
  // Parse rather than regex-strip: an eventUrl carrying a path (or lacking a
  // scheme) must still resolve to the bare origin's /cfp/messages.
  try {
    const url = new URL(
      /^https?:\/\//.test(eventUrl) ? eventUrl : `https://${eventUrl}`,
    )
    return `${url.origin}/cfp/messages`
  } catch {
    const domain = eventUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return `https://${domain}/cfp/messages`
  }
}

export function BaseEmailTemplate({
  title,
  titleColor,
  titleTone = 'neutral',
  brandColor = DEFAULT_EMAIL_BRAND_COLOR,
  speakerName,
  proposalTitle,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  children,
  footer,
  unsubscribeUrl,
  showMessagesLink,
  customContent,
}: BaseEmailTemplateProps) {
  // Resolved ONCE here and published to every primitive below via
  // EmailBrandProvider — email has no CSS custom properties, so this is the
  // only mechanism by which a nested EmailButton can know the tenant's colour.
  const brand = resolveEmailBrandPalette(brandColor)
  const accent = brand.accent
  const resolvedTitleColor =
    titleColor ?? (titleTone === 'brand' ? accent : NEUTRAL_TITLE_COLOR)

  if (!speakerName && !customContent) {
    throw new Error(
      `BaseEmailTemplate requires either speakerName or customContent to be provided. ` +
        `Use speakerName for personalized emails or customContent for broadcast emails. ` +
        `Title: "${title || 'No title provided'}"`,
    )
  }

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
    color: resolvedTitleColor,
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
    backgroundColor: brand.cardBackground,
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '24px',
    border: `1px solid ${brand.cardBorder}`,
  }

  const eventDetailsHeaderStyle: React.CSSProperties = {
    color: accent,
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
    color: accent,
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
    color: accent,
    textDecoration: 'none',
    fontSize: '0',
    marginRight: '12px',
    display: 'inline-block',
    padding: '4px',
  }

  const socialContainerStyle: React.CSSProperties = {
    textAlign: 'center' as const,
    marginBottom: '16px',
  }

  return (
    <EmailBrandProvider brandColor={brandColor}>
      <div style={containerStyle}>
        <table
          role="presentation"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              <td>
                <h1 style={headerStyle}>{customContent?.heading || title}</h1>

                {speakerName && !customContent && (
                  <p style={paragraphStyle}>Dear {speakerName},</p>
                )}

                {customContent?.body ? (
                  customContent.body
                ) : (
                  <>
                    {proposalTitle && (
                      <p style={paragraphStyle}>
                        Thank you for submitting your proposal{' '}
                        <strong style={{ color: accent }}>
                          &quot;{proposalTitle}&quot;
                        </strong>{' '}
                        for {eventName}.
                      </p>
                    )}

                    {children}
                  </>
                )}

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

                {!footer && (
                  <>
                    <hr style={hrStyle} />

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
                          Follow {eventName}:
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
                        <strong style={{ color: accent }}>{eventName}</strong>
                        .<br />
                        {unsubscribeUrl ? (
                          <a
                            href={unsubscribeUrl}
                            style={{
                              color: accent,
                              textDecoration: 'underline',
                            }}
                          >
                            Unsubscribe from these emails
                          </a>
                        ) : (
                          'If you have any questions, please contact the organizers.'
                        )}
                      </p>
                    </div>
                  </>
                )}

                {/* Adoption line (V2e): rendered regardless of a custom footer so
                  the decision templates (which supply their own footer) get it
                  too. Speaker-facing templates opt in via `showMessagesLink`. */}
                {showMessagesLink && (
                  <p
                    style={{
                      fontSize: '13px',
                      color: '#94A3B8',
                      textAlign: 'center' as const,
                      marginTop: '16px',
                      marginBottom: '0',
                      lineHeight: '1.5',
                    }}
                  >
                    You can reach the organizers anytime via{' '}
                    <a
                      href={messagesUrlFromEventUrl(eventUrl)}
                      style={{ color: '#64748B', textDecoration: 'underline' }}
                    >
                      Messages
                    </a>{' '}
                    on the site.
                  </p>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </EmailBrandProvider>
  )
}
