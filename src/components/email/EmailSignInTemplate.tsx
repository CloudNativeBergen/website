import * as React from 'react'
import {
  BaseEmailTemplate,
  DEFAULT_EMAIL_BRAND_COLOR,
} from './BaseEmailTemplate'

interface EmailSignInTemplateProps {
  /** The absolute, single-purpose sign-in URL. */
  signInUrl: string
  /** Minutes the link stays valid — rendered so the recipient can act on it. */
  expiresInMinutes: number
  /**
   * Whether the link is consumed on first use (stored tier). The copy must not
   * promise single use for the stateless tier, where it is untrue — a security
   * claim in an email is a security claim.
   */
  singleUse: boolean
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  brandColor?: string
}

/**
 * The magic-link email.
 *
 * DELIBERATELY CONTENT-FREE about the account: it never says whether an account
 * exists, never greets the recipient by a stored name, and reads identically
 * for a brand-new address and a long-standing organizer. The request endpoint's
 * uniform response is only half of the no-enumeration property; this template is
 * the other half, because the mail itself is observable by whoever asked for it
 * only when they control the mailbox.
 *
 * It also carries the "you did not request this" line, which is the sole
 * defence a recipient has against someone else typing their address in.
 */
export function EmailSignInTemplate({
  signInUrl,
  expiresInMinutes,
  singleUse,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  brandColor = DEFAULT_EMAIL_BRAND_COLOR,
}: EmailSignInTemplateProps) {
  const buttonStyle: React.CSSProperties = {
    display: 'inline-block',
    backgroundColor: brandColor,
    color: '#ffffff',
    padding: '14px 28px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '16px',
  }

  const mutedStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#64748B',
    lineHeight: '1.6',
  }

  return (
    <BaseEmailTemplate
      title={`Sign in to ${eventName}`}
      brandColor={brandColor}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      customContent={{
        heading: `Sign in to ${eventName}`,
        body: (
          <>
            <p style={{ fontSize: '16px', lineHeight: '1.6' }}>
              Use the button below to sign in. No password needed.
            </p>
            <p style={{ margin: '24px 0' }}>
              <a href={signInUrl} style={buttonStyle}>
                Sign in
              </a>
            </p>
            <p style={mutedStyle}>
              {singleUse
                ? `This link can be used once and expires in ${expiresInMinutes} minutes.`
                : `This link expires in ${expiresInMinutes} minutes.`}{' '}
              If it has expired, request a new one from the sign-in page.
            </p>
            <p style={mutedStyle}>
              If you did not ask to sign in, you can ignore this email — nothing
              happens until the link is opened.
            </p>
            <p style={mutedStyle}>
              If the button does not work, copy this address into your browser:
              <br />
              <span style={{ wordBreak: 'break-all' }}>{signInUrl}</span>
            </p>
          </>
        ),
      }}
    />
  )
}
