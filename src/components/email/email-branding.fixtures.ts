/**
 * Shared render fixtures for the email branding tests (unthemed + themed).
 *
 * Kept in one module so the themed suite renders EXACTLY the same inputs as the
 * byte-identity suite — otherwise a "themed" diff could come from a prop that
 * differs, not from branding.
 */
import type { PortableTextBlock } from '@portabletext/types'

const event = {
  eventName: 'Cloud Native Days Bergen',
  eventLocation: 'Bergen, Norway',
  eventDate: 'October 28, 2026',
  eventUrl: 'https://cloudnativebergen.dev',
  socialLinks: ['https://twitter.com/cnbergen', 'https://github.com/cnbergen'],
}

const portableTextBlocks = [
  {
    _type: 'block',
    _key: 'h1',
    style: 'h1',
    children: [{ _type: 'span', _key: 's1', text: 'Heading one', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'h2',
    style: 'h2',
    children: [{ _type: 'span', _key: 's2', text: 'Heading two', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'h3',
    style: 'h3',
    children: [{ _type: 'span', _key: 's3', text: 'Heading three', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'h4',
    style: 'h4',
    children: [{ _type: 'span', _key: 's4', text: 'Heading four', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'h5',
    style: 'h5',
    children: [{ _type: 'span', _key: 's5', text: 'Heading five', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'h6',
    style: 'h6',
    children: [{ _type: 'span', _key: 's6', text: 'Heading six', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    markDefs: [{ _type: 'link', _key: 'l1', href: 'https://example.com' }],
    children: [
      { _type: 'span', _key: 'a', text: 'plain ', marks: [] },
      { _type: 'span', _key: 'b', text: 'bold', marks: ['strong'] },
      { _type: 'span', _key: 'c', text: ' and ', marks: [] },
      { _type: 'span', _key: 'd', text: 'italic', marks: ['em'] },
      { _type: 'span', _key: 'e', text: ' and ', marks: [] },
      { _type: 'span', _key: 'f', text: 'a link', marks: ['l1'] },
      { _type: 'span', _key: 'g', text: ' and ', marks: [] },
      { _type: 'span', _key: 'h', text: 'code', marks: ['code'] },
      { _type: 'span', _key: 'i', text: ' and ', marks: [] },
      { _type: 'span', _key: 'j', text: 'underline', marks: ['underline'] },
    ],
  },
  {
    _type: 'block',
    _key: 'q1',
    style: 'blockquote',
    children: [{ _type: 'span', _key: 'sq', text: 'A quotation', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'li1',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _type: 'span', _key: 'sl', text: 'Bullet item', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'li2',
    style: 'normal',
    listItem: 'number',
    level: 1,
    children: [{ _type: 'span', _key: 'sn', text: 'Numbered item', marks: [] }],
    markDefs: [],
  },
] as unknown as PortableTextBlock[]

export const unthemedEmailFixtures = {
  event,
  portableTextBlocks,

  proposalProps: {
    speakerName: 'Ada Lovelace',
    proposalTitle: 'Analytical Engines at Scale',
    comment: 'We loved the abstract.',
    ...event,
  },

  broadcastProps: {
    subject: 'Programme announced',
    ...event,
    content: 'Broadcast body',
  },

  badgeProps: {
    speakerName: 'Ada Lovelace',
    conferenceName: 'Cloud Native Days Bergen',
    conferenceYear: '2026',
    badgeType: 'speaker' as const,
    downloadUrl: 'https://example.com/badge.png',
    organizerName: 'Cloud Native Bergen',
  },

  coSpeakerInvitationProps: {
    inviterName: 'Ada Lovelace',
    inviterEmail: 'ada@example.com',
    inviteeName: 'Grace Hopper',
    proposalTitle: 'Analytical Engines at Scale',
    proposalAbstract: 'A talk about engines.',
    invitationUrl: 'https://example.com/invite',
    expiresAt: 'November 1, 2026',
    ...event,
  },

  coSpeakerResponseProps: {
    inviterName: 'Ada Lovelace',
    respondentName: 'Grace Hopper',
    respondentEmail: 'grace@example.com',
    proposalTitle: 'Analytical Engines at Scale',
    proposalUrl: 'https://example.com/proposal',
    accepted: true,
    ...event,
  },

  contractReminderProps: {
    sponsorName: 'Acme Corp',
    signerName: 'Wile E. Coyote',
    signingUrl: 'https://example.com/sign',
    reminderNumber: 2,
    ...event,
  },

  contractSignedProps: {
    sponsorName: 'Acme Corp',
    signerName: 'Wile E. Coyote',
    tierName: 'Gold',
    contractValue: 'NOK 100 000',
    ...event,
  },

  contractSigningProps: {
    sponsorName: 'Acme Corp',
    signerName: 'Wile E. Coyote',
    signerEmail: 'wile@example.com',
    signingUrl: 'https://example.com/sign',
    tierName: 'Gold',
    contractValue: 'NOK 100 000',
    ...event,
  },

  galleryProps: {
    speakerName: 'Ada Lovelace',
    imageUrl: 'https://example.com/photo.jpg',
    imageAlt: 'A photo',
    galleryUrl: 'https://example.com/gallery',
    dashboardUrl: 'https://example.com/dashboard',
    ...event,
  },

  messageProps: {
    recipientName: 'Ada Lovelace',
    authorName: 'The Organizers',
    subject: 'About your talk',
    excerpt: 'We have a question about your session.',
    replyUrl: 'https://example.com/cfp/messages',
    preferencesUrl: 'https://example.com/cfp/profile',
    ...event,
  },

  speakerEmailProps: {
    speakers: [{ name: 'Ada Lovelace', email: 'ada@example.com' }],
    proposalTitle: 'Analytical Engines at Scale',
    proposalUrl: 'https://example.com/proposal',
    subject: 'A question',
    message: 'Could you confirm your slot?',
    senderName: 'The Organizers',
    ...event,
  },

  speakerTicketProps: {
    speakerName: 'Ada Lovelace',
    registrationUrl: 'https://example.com/register',
    ...event,
  },

  sponsorMessageProps: {
    recipientName: 'Wile E. Coyote',
    authorName: 'The Organizers',
    subject: 'Acme Corp',
    excerpt: 'A question about your logo.',
    portalUrl: 'https://example.com/sponsor/portal/abc#messages',
    ...event,
  },

  sponsorPortalInviteProps: {
    sponsorName: 'Acme Corp',
    portalUrl: 'https://example.com/sponsor/portal/abc',
    tierName: 'Gold',
    contractValue: 'NOK 100 000',
    ...event,
  },

  volunteerProps: {
    volunteerName: 'Grace Hopper',
    message: 'Welcome aboard!',
    ...event,
  },
}
