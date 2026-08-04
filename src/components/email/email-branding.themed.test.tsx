/**
 * The other half of the byte-identity suite: proof that a THEMED conference's
 * mail actually carries its own colour, and that the colours which must NOT
 * follow the tenant still do not.
 *
 * `email-branding.test.tsx` pins the unthemed bytes; this file is free to churn.
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

import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { renderEmailTemplate } from '@/lib/email/route-helpers'
import { resolveEmailBrandPalette } from '@/lib/branding/email'
import { contrastRatio } from '@/lib/branding/color'
import type { Conference } from '@/lib/conference/types'
import { unthemedEmailFixtures as f } from './email-branding.fixtures'

/** A deep magenta, nothing like the house blue and dark enough to pass contrast unclamped. */
const BRAND = '#9D174D'

/**
 * Every house brand literal the templates used to hard-code. None of these may
 * survive into a themed tenant's mail.
 */
const HOUSE_BRAND_HEXES = [
  '#1D4ED8',
  '#1E40AF',
  '#2563EB',
  '#0284C7',
  '#7C3AED',
  'rgba(29, 78, 216',
]

const render = (el: React.ReactElement) => renderToStaticMarkup(el)

const themed: Array<[string, () => string]> = [
  [
    'ProposalAcceptTemplate',
    () =>
      render(
        <ProposalAcceptTemplate
          {...f.proposalProps}
          confirmUrl="https://example.com/confirm"
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'ProposalRejectTemplate',
    () =>
      render(
        <ProposalRejectTemplate {...f.proposalProps} brandColor={BRAND} />,
      ),
  ],
  [
    'ProposalWaitlistTemplate',
    () =>
      render(
        <ProposalWaitlistTemplate {...f.proposalProps} brandColor={BRAND} />,
      ),
  ],
  [
    'BroadcastTemplate',
    () =>
      render(<BroadcastTemplate {...f.broadcastProps} brandColor={BRAND} />),
  ],
  [
    'SpeakerEmailTemplate',
    () =>
      render(
        <SpeakerEmailTemplate {...f.speakerEmailProps} brandColor={BRAND} />,
      ),
  ],
  [
    'SpeakerTicketEmailTemplate',
    () =>
      render(
        <SpeakerTicketEmailTemplate
          {...f.speakerTicketProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'CoSpeakerInvitationTemplate',
    () =>
      render(
        <CoSpeakerInvitationTemplate
          {...f.coSpeakerInvitationProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'CoSpeakerResponseTemplate',
    () =>
      render(
        <CoSpeakerResponseTemplate
          {...f.coSpeakerResponseProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'GallerySpeakerTaggedTemplate',
    () =>
      render(
        <GallerySpeakerTaggedTemplate {...f.galleryProps} brandColor={BRAND} />,
      ),
  ],
  [
    'MessageNotificationTemplate',
    () =>
      render(
        <MessageNotificationTemplate {...f.messageProps} brandColor={BRAND} />,
      ),
  ],
  [
    'SponsorMessageNotificationTemplate',
    () =>
      render(
        <SponsorMessageNotificationTemplate
          {...f.sponsorMessageProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'SponsorPortalInviteTemplate',
    () =>
      render(
        <SponsorPortalInviteTemplate
          {...f.sponsorPortalInviteProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'ContractSigningTemplate',
    () =>
      render(
        <ContractSigningTemplate
          {...f.contractSigningProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'ContractSignedTemplate',
    () =>
      render(
        <ContractSignedTemplate
          {...f.contractSignedProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'ContractReminderTemplate',
    () =>
      render(
        <ContractReminderTemplate
          {...f.contractReminderProps}
          brandColor={BRAND}
        />,
      ),
  ],
  [
    'VolunteerApprovalTemplate',
    () =>
      render(
        <VolunteerApprovalTemplate {...f.volunteerProps} brandColor={BRAND} />,
      ),
  ],
  [
    'BadgeEmailTemplate',
    () => BadgeEmailTemplate({ ...f.badgeProps, brandColor: BRAND }),
  ],
  ['portableTextToHTML', () => portableTextToHTML(f.portableTextBlocks, BRAND)],
]

describe('a themed conference sends its own colour', () => {
  it.each(themed)('%s carries the brand colour', (_name, run) => {
    expect(run().toLowerCase()).toContain(BRAND.toLowerCase())
  })

  it.each(themed)('%s carries no house brand literal', (_name, run) => {
    const html = run().toLowerCase()
    for (const hex of HOUSE_BRAND_HEXES) {
      expect(html).not.toContain(hex.toLowerCase())
    }
  })
})

describe('status colours are exempt from branding', () => {
  it('a rejection keeps its red and its success green', () => {
    const html = render(
      <ProposalRejectTemplate {...f.proposalProps} brandColor={BRAND} />,
    )
    expect(html).toContain('#EF4444')
    expect(html).toContain('#059669')
  })

  it('a waitlist keeps its orange, including the H1', () => {
    const html = render(
      <ProposalWaitlistTemplate {...f.proposalProps} brandColor={BRAND} />,
    )
    expect(html).toContain('#F97316')
    expect(html).toContain('#F59E0B')
    expect(html).toContain('#D97706')
  })

  it('a signed contract keeps its success green H1', () => {
    const html = render(
      <ContractSignedTemplate {...f.contractSignedProps} brandColor={BRAND} />,
    )
    expect(html).toContain('#059669')
  })
})

describe('renderEmailTemplate brands from the conference theme', () => {
  const conference = {
    title: 'Themed Conf',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-10-28',
    domains: ['themed.example'],
    socialLinks: [],
    theme: { primaryColor: BRAND, accentColor: '#F59E0B' },
  } as unknown as Conference

  it('uses the tenant primary, not the house blue', () => {
    const html = renderToStaticMarkup(
      renderEmailTemplate({
        conference,
        subject: 'Hello',
        htmlContent: '<p>Body</p>',
      }),
    ).toLowerCase()
    expect(html).toContain(BRAND.toLowerCase())
    expect(html).not.toContain('#1d4ed8')
  })

  it('falls back to the house blue for a conference with no theme', () => {
    const html = renderToStaticMarkup(
      renderEmailTemplate({
        conference: { ...conference, theme: undefined } as Conference,
        subject: 'Hello',
        htmlContent: '<p>Body</p>',
      }),
    ).toLowerCase()
    expect(html).toContain('#1d4ed8')
  })

  it('treats a HALF theme as unthemed, matching the site and the manifest', () => {
    const html = renderToStaticMarkup(
      renderEmailTemplate({
        conference: {
          ...conference,
          theme: { primaryColor: BRAND },
        } as unknown as Conference,
        subject: 'Hello',
        htmlContent: '<p>Body</p>',
      }),
    ).toLowerCase()
    expect(html).toContain('#1d4ed8')
    expect(html).not.toContain(BRAND.toLowerCase())
  })
})

describe('contrast', () => {
  it('leaves a dark-enough brand colour untouched', () => {
    expect(resolveEmailBrandPalette(BRAND).accent).toBe(BRAND)
  })

  it('darkens a pale brand colour so white button text stays readable', () => {
    // Sunflower yellow: white text on it is 1.5:1 — illegible.
    const pale = '#FACC15'
    const { accent } = resolveEmailBrandPalette(pale)
    expect(accent).not.toBe(pale)
    expect(contrastRatio(accent, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the hue while darkening — a yellow stays yellow, not grey', () => {
    const { accent } = resolveEmailBrandPalette('#FACC15')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(b)
    expect(g).toBeGreaterThan(b)
  })

  it('every clamped brand colour clears AA against white', () => {
    for (const hex of ['#FACC15', '#06B6D4', '#F97316', '#A3E635', '#FFFFFF']) {
      expect(
        contrastRatio(resolveEmailBrandPalette(hex).accent, '#ffffff'),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('derives the card tint and the button shadow from the brand', () => {
    const p = resolveEmailBrandPalette(BRAND)
    expect(p.cardBackground).not.toBe('#E0F2FE')
    expect(p.buttonShadow).toBe('rgba(157, 23, 77, 0.25)')
  })
})
