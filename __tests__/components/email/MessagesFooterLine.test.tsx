/**
 * Adoption footer line (V2e): speaker-facing transactional emails gain ONE muted
 * line pointing at the on-site Messages inbox. The line is defined once in
 * BaseEmailTemplate and opted into per template via `showMessagesLink`, so it
 * rides the decision + co-speaker emails but NOT sponsor/broadcast/attendee mail.
 * The URL is derived from `eventUrl` and normalised to `https://<domain>/cfp/messages`.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BaseEmailTemplate } from '@/components/email/BaseEmailTemplate'
import { ProposalAcceptTemplate } from '@/components/email/ProposalAcceptTemplate'
import { ProposalRejectTemplate } from '@/components/email/ProposalRejectTemplate'
import { CoSpeakerInvitationTemplate } from '@/components/email/CoSpeakerInvitationTemplate'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'

const MESSAGES_COPY = 'You can reach the organizers anytime via'

const decisionProps = {
  speakerName: 'Kari Nordmann',
  proposalTitle: 'Scaling Kubernetes',
  eventName: 'CNDN',
  eventLocation: 'Bergen, Norway',
  eventDate: '2026-09-01',
  socialLinks: [],
}

describe('Messages adoption footer line (V2e)', () => {
  it('renders the muted Messages line when opted in, with a normalised https URL', () => {
    const html = renderToStaticMarkup(
      <BaseEmailTemplate
        title="Test"
        speakerName="Kari"
        eventName="CNDN"
        eventLocation="Bergen"
        eventDate="2026-09-01"
        eventUrl="cndn.no"
        socialLinks={[]}
        showMessagesLink
      />,
    )
    expect(html).toContain(MESSAGES_COPY)
    expect(html).toContain('https://cndn.no/cfp/messages')
  })

  it('omits the line by default (not opted in)', () => {
    const html = renderToStaticMarkup(
      <BaseEmailTemplate
        title="Test"
        speakerName="Kari"
        eventName="CNDN"
        eventLocation="Bergen"
        eventDate="2026-09-01"
        eventUrl="cndn.no"
        socialLinks={[]}
      />,
    )
    expect(html).not.toContain(MESSAGES_COPY)
  })

  it('normalises an eventUrl that already has protocol and a trailing slash', () => {
    const html = renderToStaticMarkup(
      <BaseEmailTemplate
        title="Test"
        speakerName="Kari"
        eventName="CNDN"
        eventLocation="Bergen"
        eventDate="2026-09-01"
        eventUrl="https://cndn.no/"
        socialLinks={[]}
        showMessagesLink
      />,
    )
    expect(html).toContain('https://cndn.no/cfp/messages')
    expect(html).not.toContain('https://https://')
  })

  it('rides the proposal ACCEPT email (custom footer path)', () => {
    const html = renderToStaticMarkup(
      <ProposalAcceptTemplate
        {...decisionProps}
        eventUrl="https://cndn.no"
        confirmUrl="https://cndn.no/confirm"
      />,
    )
    expect(html).toContain(MESSAGES_COPY)
    expect(html).toContain('https://cndn.no/cfp/messages')
  })

  it('rides the proposal REJECT email', () => {
    const html = renderToStaticMarkup(
      <ProposalRejectTemplate {...decisionProps} eventUrl="https://cndn.no" />,
    )
    expect(html).toContain(MESSAGES_COPY)
  })

  it('rides the co-speaker INVITATION email (default footer path)', () => {
    const html = renderToStaticMarkup(
      <CoSpeakerInvitationTemplate
        inviterName="Ola"
        inviterEmail="ola@example.com"
        inviteeName="Kari"
        proposalTitle="Scaling Kubernetes"
        proposalAbstract="A talk about scale."
        invitationUrl="https://cndn.no/invite/abc"
        eventName="CNDN"
        eventLocation="Bergen, Norway"
        eventDate="2026-09-01"
        eventUrl="https://cndn.no"
        expiresAt="2026-08-01"
        socialLinks={[]}
      />,
    )
    expect(html).toContain(MESSAGES_COPY)
    expect(html).toContain('https://cndn.no/cfp/messages')
  })

  it('does NOT ride the broadcast email (not opted in)', () => {
    const html = renderToStaticMarkup(
      <BroadcastTemplate
        subject="Newsletter"
        content="<p>Hello</p>"
        eventName="CNDN"
        eventLocation="Bergen, Norway"
        eventDate="2026-09-01"
        eventUrl="https://cndn.no"
        socialLinks={[]}
      />,
    )
    expect(html).not.toContain(MESSAGES_COPY)
  })
})
