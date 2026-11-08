import * as React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton, EmailText } from './EmailComponents'

/**
 * An identity organization invitation (#2130), sent on identity's behalf by
 * POST /api/identity/service/invitations. Carries the org name, the inviter's
 * name and the accept link, nothing else.
 */
export interface IdentityInvitationTemplateProps {
  orgName: string
  inviterName: string
  invitationUrl: string
}

export function IdentityInvitationTemplate({
  orgName,
  inviterName,
  invitationUrl,
}: IdentityInvitationTemplateProps) {
  return (
    <BaseEmailTemplate
      eventName={orgName}
      eventLocation=""
      eventDate=""
      eventUrl={invitationUrl}
      socialLinks={[]}
      customContent={{
        heading: 'Organization Invitation',
        body: (
          <>
            <EmailText>
              <strong>{inviterName}</strong> has invited you to join{' '}
              <strong>{orgName}</strong>.
            </EmailText>
            <div style={{ textAlign: 'center', margin: '24px 0' }}>
              <EmailButton href={invitationUrl}>Review invitation</EmailButton>
            </div>
            <EmailText size="14px" color="#64748B">
              Sign in with an account that uses the address this email was sent
              to. If you were not expecting this, you can ignore this message:
              nothing happens until the invitation is accepted.
            </EmailText>
          </>
        ),
      }}
    />
  )
}
