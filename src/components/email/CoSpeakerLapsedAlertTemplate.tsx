import React from 'react'
import { BaseEmailTemplate } from './BaseEmailTemplate'
import { EmailButton, EmailSection, EmailText } from './EmailComponents'

export interface LapsedCoSpeakerItem {
  /** Proposal title, as the organizers know it. */
  proposalTitle: string
  /** Who was invited — name when known, otherwise the address. */
  invitedName: string
  invitedEmail: string
  /** Formatted date the invitation stopped working. */
  expiredOn: string
  /** Admin link to the proposal. */
  proposalUrl: string
}

interface CoSpeakerLapsedAlertTemplateProps {
  items: LapsedCoSpeakerItem[]
  proposalsUrl: string
  eventName: string
  eventLocation: string
  eventDate: string
  eventUrl: string
  socialLinks: string[]
  brandColor?: string
}

/**
 * Tells the organizers that a co-speaker invitation lapsed on a CONFIRMED talk.
 *
 * Addressed to the CFP mailbox, not to a speaker: this is an operations notice
 * about something already broken — the invitee is not on the programme and is
 * not in any ticket or badge run — and it names what to do about it.
 */
export const CoSpeakerLapsedAlertTemplate: React.FC<
  CoSpeakerLapsedAlertTemplateProps
> = ({
  items,
  proposalsUrl,
  eventName,
  eventLocation,
  eventDate,
  eventUrl,
  socialLinks,
  brandColor,
}) => {
  // ONE string for the <title> and the H1: they were separate, and the
  // singular case read "1 co-speaker invitation expired on confirmed talks".
  const headline =
    items.length === 1
      ? 'A co-speaker invitation expired'
      : `${items.length} co-speaker invitations expired`

  return (
    <BaseEmailTemplate
      title={headline}
      eventName={eventName}
      eventLocation={eventLocation}
      eventDate={eventDate}
      eventUrl={eventUrl}
      socialLinks={socialLinks}
      brandColor={brandColor}
      customContent={{
        heading: headline,
        body: (
          <>
            <EmailText>
              {items.length === 1
                ? 'A co-speaker invitation on a confirmed talk expired before it was answered.'
                : `${items.length} co-speaker invitations on confirmed talks expired before they were answered.`}{' '}
              An expired invitation cannot be accepted, so nobody was added to
              the talk and nobody will be until a new invitation is sent and
              accepted. Until then the invitee does not appear in the programme
              or on the website, and is not included in speaker tickets or
              badges.
            </EmailText>

            {items.map((item) => (
              <EmailSection
                key={`${item.proposalUrl}-${item.invitedEmail}`}
                backgroundColor="#F8FAFC"
                borderColor="#E2E8F0"
              >
                <EmailText weight="600">{item.proposalTitle}</EmailText>
                <EmailText>
                  {item.invitedName === item.invitedEmail
                    ? item.invitedEmail
                    : `${item.invitedName} (${item.invitedEmail})`}{' '}
                  — invitation expired {item.expiredOn}.
                </EmailText>
                <EmailText size="14px" color="#475569">
                  <a href={item.proposalUrl}>Open the proposal</a> to send a new
                  invitation, or cancel this one if the co-speaker is no longer
                  joining.
                </EmailText>
              </EmailSection>
            ))}

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <EmailButton href={proposalsUrl}>Review proposals</EmailButton>
            </div>

            <div style={{ marginTop: '24px' }}>
              <EmailText size="14px" color="#475569">
                This notice is sent once per invitation.
              </EmailText>
            </div>
          </>
        ),
      }}
    />
  )
}
