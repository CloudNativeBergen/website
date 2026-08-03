/**
 * BYTE-IDENTITY NET for email brand theming.
 *
 * Every template is rendered with NO brand colour — the state of the three live
 * conference editions that store no `theme`. The committed snapshots were
 * generated on the commit BEFORE brand theming landed, so any diff here means an
 * unthemed tenant's mail changed. If one of these fails, fix the code; do NOT
 * regenerate the snapshot.
 *
 * The themed counterparts (and the assertions that house blue is actually gone)
 * live in `email-branding.themed.test.tsx`, which is free to churn.
 */
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BadgeEmailTemplate } from './BadgeEmailTemplate'
import { BroadcastTemplate } from './BroadcastTemplate'
import { ContractReminderTemplate } from './ContractReminderTemplate'
import { ContractSignedTemplate } from './ContractSignedTemplate'
import { ContractSigningTemplate } from './ContractSigningTemplate'
import { CoSpeakerInvitationTemplate } from './CoSpeakerInvitationTemplate'
import { CoSpeakerResponseTemplate } from './CoSpeakerResponseTemplate'
import { GallerySpeakerTaggedTemplate } from './GallerySpeakerTaggedTemplate'
import { MessageNotificationTemplate } from './MessageNotificationTemplate'
import { ProposalAcceptTemplate } from './ProposalAcceptTemplate'
import { ProposalRejectTemplate } from './ProposalRejectTemplate'
import { ProposalWaitlistTemplate } from './ProposalWaitlistTemplate'
import { SpeakerEmailTemplate } from './SpeakerEmailTemplate'
import { SpeakerTicketEmailTemplate } from './SpeakerTicketEmailTemplate'
import { SponsorMessageNotificationTemplate } from './SponsorMessageNotificationTemplate'
import { SponsorPortalInviteTemplate } from './SponsorPortalInviteTemplate'
import { VolunteerApprovalTemplate } from './VolunteerApprovalTemplate'
import { EmailButton, EmailSectionHeader } from './EmailComponents'
import { BaseEmailTemplate } from './BaseEmailTemplate'

import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { unthemedEmailFixtures } from './email-branding.fixtures'

const {
  event,
  proposalProps,
  portableTextBlocks,
  broadcastProps,
  badgeProps,
  coSpeakerInvitationProps,
  coSpeakerResponseProps,
  contractReminderProps,
  contractSignedProps,
  contractSigningProps,
  galleryProps,
  messageProps,
  speakerEmailProps,
  speakerTicketProps,
  sponsorMessageProps,
  sponsorPortalInviteProps,
  volunteerProps,
} = unthemedEmailFixtures

const render = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('unthemed email output is byte-identical', () => {
  it('BaseEmailTemplate', () => {
    expect(
      render(
        <BaseEmailTemplate {...event} title="Hello" speakerName="Ada Lovelace">
          <p>Body</p>
        </BaseEmailTemplate>,
      ),
    ).toMatchSnapshot()
  })

  it('EmailButton (primary + secondary)', () => {
    expect(
      render(
        <>
          <EmailButton href="https://example.com/a">Primary</EmailButton>
          <EmailButton href="https://example.com/b" variant="secondary">
            Secondary
          </EmailButton>
        </>,
      ),
    ).toMatchSnapshot()
  })

  it('EmailSectionHeader', () => {
    expect(
      render(<EmailSectionHeader>Header</EmailSectionHeader>),
    ).toMatchSnapshot()
  })

  it('ProposalAcceptTemplate', () => {
    expect(
      render(
        <ProposalAcceptTemplate
          {...proposalProps}
          confirmUrl="https://example.com/confirm"
        />,
      ),
    ).toMatchSnapshot()
  })

  it('ProposalRejectTemplate', () => {
    expect(
      render(<ProposalRejectTemplate {...proposalProps} />),
    ).toMatchSnapshot()
  })

  it('ProposalWaitlistTemplate', () => {
    expect(
      render(<ProposalWaitlistTemplate {...proposalProps} />),
    ).toMatchSnapshot()
  })

  it('BroadcastTemplate', () => {
    expect(render(<BroadcastTemplate {...broadcastProps} />)).toMatchSnapshot()
  })

  it('SpeakerEmailTemplate', () => {
    expect(
      render(<SpeakerEmailTemplate {...speakerEmailProps} />),
    ).toMatchSnapshot()
  })

  it('SpeakerTicketEmailTemplate', () => {
    expect(
      render(<SpeakerTicketEmailTemplate {...speakerTicketProps} />),
    ).toMatchSnapshot()
  })

  it('CoSpeakerInvitationTemplate', () => {
    expect(
      render(<CoSpeakerInvitationTemplate {...coSpeakerInvitationProps} />),
    ).toMatchSnapshot()
  })

  it('CoSpeakerResponseTemplate', () => {
    expect(
      render(<CoSpeakerResponseTemplate {...coSpeakerResponseProps} />),
    ).toMatchSnapshot()
  })

  it('GallerySpeakerTaggedTemplate', () => {
    expect(
      render(<GallerySpeakerTaggedTemplate {...galleryProps} />),
    ).toMatchSnapshot()
  })

  it('MessageNotificationTemplate', () => {
    expect(
      render(<MessageNotificationTemplate {...messageProps} />),
    ).toMatchSnapshot()
  })

  it('SponsorMessageNotificationTemplate', () => {
    expect(
      render(<SponsorMessageNotificationTemplate {...sponsorMessageProps} />),
    ).toMatchSnapshot()
  })

  it('SponsorPortalInviteTemplate', () => {
    expect(
      render(<SponsorPortalInviteTemplate {...sponsorPortalInviteProps} />),
    ).toMatchSnapshot()
  })

  it('ContractSigningTemplate', () => {
    expect(
      render(<ContractSigningTemplate {...contractSigningProps} />),
    ).toMatchSnapshot()
  })

  it('ContractSignedTemplate', () => {
    expect(
      render(<ContractSignedTemplate {...contractSignedProps} />),
    ).toMatchSnapshot()
  })

  it('ContractReminderTemplate', () => {
    expect(
      render(<ContractReminderTemplate {...contractReminderProps} />),
    ).toMatchSnapshot()
  })

  it('VolunteerApprovalTemplate', () => {
    expect(
      render(<VolunteerApprovalTemplate {...volunteerProps} />),
    ).toMatchSnapshot()
  })

  it('BadgeEmailTemplate (raw HTML)', () => {
    expect(BadgeEmailTemplate(badgeProps)).toMatchSnapshot()
  })

  it('portableTextToHTML', () => {
    expect(portableTextToHTML(portableTextBlocks)).toMatchSnapshot()
  })
})
