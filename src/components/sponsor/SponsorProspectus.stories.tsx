import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorProspectus } from './SponsorProspectus'
import type { Conference } from '@/lib/conference/types'
import type { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'

function mockConference(overrides?: Partial<Conference>): Conference {
  return {
    _id: 'conf-2026',
    title: 'Cloud Native Days Norway 2026',
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    cfpStartDate: '2026-01-01',
    cfpEndDate: '2026-03-01',
    cfpNotifyDate: '2026-04-01',
    cfpEmail: 'cfp@cloudnativedays.no',
    sponsorEmail: 'sponsor@cloudnativedays.no',
    programDate: '2026-04-15',
    registrationEnabled: true,
    contactEmail: 'info@cloudnativedays.no',
    organizers: [],
    domains: ['cloudnativedays.no'],
    formats: [],
    topics: [],
    vanityMetrics: [
      { label: 'Attendees', value: '600+' },
      { label: 'Speakers', value: '40+' },
      { label: 'Tracks', value: '3' },
    ],
    sponsorBenefits: [
      {
        title: 'Brand Visibility',
        description:
          'Your brand across all digital channels, on-site signage, and attendee communications.',
        icon: 'MegaphoneIcon',
      },
      {
        title: 'Talent Pipeline',
        description:
          'Connect with 600+ senior engineers who build the platforms Norway runs on.',
        icon: 'UserGroupIcon',
      },
      {
        title: 'Community Credibility',
        description:
          'Position your company as a genuine supporter of the cloud native ecosystem.',
        icon: 'HeartIcon',
      },
    ],
    sponsorshipCustomization: {
      heroHeadline: 'No Sales Pitches. Just Code & Culture.',
      heroSubheadline:
        'We prioritize engineering value over marketing fluff. Our audience builds the platforms Norway runs on.',
      packageSectionTitle: 'The Base Image',
      addonSectionTitle: 'Custom Resource Definitions (CRDs)',
      philosophyTitle: "We Don't Sell Booths. We Build Credibility.",
      philosophyDescription:
        'We intentionally do not have a traditional Expo Hall. Instead, we integrate your brand into the fabric of the event.',
      closingQuote:
        "The best engineers don't apply to job ads; they work for companies they respect.",
      closingCtaText: 'git commit -m "Support the Community"',
    },
    ...overrides,
  } as Conference
}

function mockTier(overrides?: Partial<SponsorTier>): SponsorTier {
  return {
    _id: `tier-${Math.random().toString(36).substr(2, 6)}`,
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Ingress',
    tagline: 'Premium sponsorship tier',
    tierType: 'standard',
    price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
    perks: [
      {
        _key: 'pk1',
        label: 'Logo',
        description: 'Logo on website and signage',
      },
      { _key: 'pk2', label: 'Mentions', description: 'Social media mentions' },
      { _key: 'pk3', label: 'Tickets', description: '5 conference tickets' },
    ],
    soldOut: false,
    mostPopular: false,
    ...overrides,
  }
}

const standardTiers: SponsorTier[] = [
  mockTier({
    _id: 'tier-service',
    title: 'Service',
    tagline: 'Essential visibility and community support',
    price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
    perks: [
      { _key: 'pk1', label: 'Logo', description: 'Logo on website' },
      { _key: 'pk2', label: 'Tickets', description: '2 conference tickets' },
      { _key: 'pk3', label: 'Mentions', description: 'Social media mention' },
    ],
  }),
  mockTier({
    _id: 'tier-ingress',
    title: 'Ingress',
    tagline: 'Premium visibility with full integration',
    mostPopular: true,
    price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
    perks: [
      {
        _key: 'pk1',
        label: 'Logo',
        description: 'Logo on website and all materials',
      },
      { _key: 'pk2', label: 'Tickets', description: '5 conference tickets' },
      {
        _key: 'pk3',
        label: 'Booth',
        description: 'Wall of Opportunities placement',
      },
      {
        _key: 'pk4',
        label: 'Social',
        description: 'Dedicated social media post',
      },
      { _key: 'pk5', label: 'Talk', description: '5-min lightning talk slot' },
    ],
  }),
  mockTier({
    _id: 'tier-loadbalancer',
    title: 'Load Balancer',
    tagline: 'Maximum impact and exclusive benefits',
    price: [{ _key: 'p1', amount: 200000, currency: 'NOK' }],
    perks: [
      {
        _key: 'pk1',
        label: 'Logo',
        description: 'Premium logo placement everywhere',
      },
      { _key: 'pk2', label: 'Tickets', description: '10 conference tickets' },
      {
        _key: 'pk3',
        label: 'Keynote',
        description: 'Keynote introduction slot',
      },
      { _key: 'pk4', label: 'Video', description: 'Branded video content' },
      {
        _key: 'pk5',
        label: 'Booth',
        description: 'Priority Wall of Opportunities placement',
      },
      {
        _key: 'pk6',
        label: 'Social',
        description: 'Multiple dedicated social posts',
      },
    ],
  }),
]

const addonTiers: SponsorTier[] = [
  mockTier({
    _id: 'tier-lanyard',
    title: 'Lanyard',
    tagline: 'Your brand around every neck at the conference',
    tierType: 'addon',
    price: [{ _key: 'p1', amount: 30000, currency: 'NOK' }],
    maxQuantity: 1,
    perks: [
      {
        _key: 'pk1',
        label: 'Lanyard',
        description: 'Branded lanyards for all attendees',
      },
    ],
  }),
  mockTier({
    _id: 'tier-afterparty',
    title: 'After Party',
    tagline: 'Host the most memorable part of the conference',
    tierType: 'addon',
    price: [{ _key: 'p1', amount: 50000, currency: 'NOK' }],
    maxQuantity: 1,
    perks: [
      {
        _key: 'pk1',
        label: 'Party',
        description: 'Branded after-party experience',
      },
      { _key: 'pk2', label: 'Stage', description: '3-min welcome speech' },
    ],
  }),
  mockTier({
    _id: 'tier-coffee',
    title: 'Coffee Break',
    tagline: 'Fuel the conversations that matter',
    tierType: 'addon',
    price: [{ _key: 'p1', amount: 20000, currency: 'NOK' }],
    maxQuantity: 2,
    perks: [
      { _key: 'pk1', label: 'Coffee', description: 'Branded coffee station' },
    ],
  }),
]

const specialTiers: SponsorTier[] = [
  mockTier({
    _id: 'tier-community',
    title: 'Community Partner',
    tagline:
      'For non-profit and community organizations supporting the cloud native ecosystem.',
    tierType: 'special',
    price: [],
    perks: [],
  }),
  mockTier({
    _id: 'tier-media',
    title: 'Media Partner',
    tagline:
      'For media outlets covering the cloud native space in the Nordics.',
    tierType: 'special',
    price: [],
    perks: [],
  }),
]

const pastSponsors: ConferenceSponsor[] = [
  {
    sponsor: {
      _id: 'sp-1',
      name: 'NAIS',
      website: 'https://nais.io',
    },
    tier: { title: 'Load Balancer', tagline: 'Top tier', tierType: 'standard' },
  },
  {
    sponsor: {
      _id: 'sp-2',
      name: 'Mnemonic',
      website: 'https://mnemonic.io',
    },
    tier: { title: 'Ingress', tagline: 'Mid tier', tierType: 'standard' },
  },
]

const meta = {
  title: 'Systems/Sponsors/Public/SponsorProspectus',
  component: SponsorProspectus,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Public-facing sponsor prospectus page showcasing sponsorship tiers, benefits, add-ons, and conference philosophy. All content is CMS-driven via the Conference document with sensible defaults. Supports standard, special, and add-on tier types with responsive layouts.',
      },
    },
  },
} satisfies Meta<typeof SponsorProspectus>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    conference: mockConference(),
    standardTiers,
    specialTiers,
    addonTiers,
    pastSponsors,
  },
}

export const MinimalTiers: Story = {
  args: {
    conference: mockConference({ vanityMetrics: [], sponsorBenefits: [] }),
    standardTiers: [standardTiers[1]],
    specialTiers: [],
    addonTiers: [],
    pastSponsors: [],
  },
}

export const TwoColumnLayout: Story = {
  args: {
    conference: mockConference(),
    standardTiers: standardTiers.slice(0, 2),
    specialTiers,
    addonTiers: addonTiers.slice(0, 2),
    pastSponsors,
  },
}

export const WithSoldOutTiers: Story = {
  args: {
    conference: mockConference(),
    standardTiers: standardTiers.map((t, i) =>
      i === 2 ? { ...t, soldOut: true } : t,
    ),
    specialTiers,
    addonTiers: addonTiers.map((t, i) =>
      i === 0 ? { ...t, soldOut: true } : t,
    ),
    pastSponsors,
  },
}
