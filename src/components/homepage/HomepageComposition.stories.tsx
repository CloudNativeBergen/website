import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { HomepageSectionRenderer } from './SectionRenderer'
import { getDefaultSections, type HomepageSection } from '@/lib/homepage'
import { mockFeaturedSpeakers } from '@/components/featuredSpeakers.mocks'
import type { Conference } from '@/lib/conference/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { TypedObject } from 'sanity'

/**
 * Whole-homepage composition stories for visual QA (`rtk pnpm shoot`). `Default`
 * renders exactly the legacy layout via `getDefaultSections`; `Custom` inserts a
 * CTA banner and rich-text block and hides a section — the two are diffed to
 * confirm the default path is unchanged and the new blocks sit correctly.
 */

function mockGalleryImage(id: string, alt: string): GalleryImageWithSpeakers {
  return {
    _id: id,
    _rev: 'r1',
    _createdAt: '2025-06-12T10:00:00Z',
    _updatedAt: '2025-06-12T10:00:00Z',
    photographer: 'Olav Nordmann',
    date: '2025-06-12',
    location: 'Grieghallen, Bergen',
    featured: true,
    imageAlt: alt,
    image: {
      _type: 'image',
      asset: {
        _ref: `image-${id}0000000000000000000000000000-1920x1080-jpg`,
        _type: 'reference',
      },
    },
    speakers: [],
  } as unknown as GalleryImageWithSpeakers
}

const sponsorLogo = (label: string, fill: string) =>
  `<svg width="100" height="40" xmlns="http://www.w3.org/2000/svg"><text x="10" y="25" fill="${fill}">${label}</text></svg>`

const mockSponsors = [
  {
    _id: 'cs-1',
    sponsor: {
      _id: 's-1',
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      logo: sponsorLogo('ACME', '#2563eb'),
    },
    tier: { title: 'Ingress', tagline: 'Premium' },
  },
  {
    _id: 'cs-2',
    sponsor: {
      _id: 's-2',
      name: 'Tech Solutions',
      website: 'https://tech.example.com',
      logo: sponsorLogo('TECH', '#10b981'),
    },
    tier: { title: 'Pod', tagline: 'Base' },
  },
]

const placeholderSvg = (label: string, hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">` +
  `<rect width="1920" height="1080" fill="hsl(${hue} 40% 30%)"/>` +
  `<text x="50%" y="50%" fill="hsl(${hue} 30% 75%)" font-family="sans-serif" font-size="90" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
  `</svg>`

const handlers = [
  http.get('https://cdn.sanity.io/images/*', ({ request }) => {
    const n = Number(/gal(\d)/.exec(new URL(request.url).pathname)?.[1] ?? 1)
    return new HttpResponse(
      placeholderSvg(`Photo ${n}`, [210, 150, 30][n - 1] ?? 210),
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }),
]

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  tagline: 'The community conference for cloud native technologies',
  description:
    'Join hundreds of developers, platform engineers and cloud native enthusiasts for a full day of talks and workshops in Bergen.',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Grieghallen',
  venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
  startDate: '2099-09-15',
  endDate: '2099-09-15',
  ticketFaqs: [
    {
      _key: 't1',
      question: 'Can I get a refund?',
      answer: 'Tickets are refundable up to 14 days before the event.',
    },
  ],
  cfpStartDate: '2020-01-01',
  cfpEndDate: '2020-06-01',
  cfpNotifyDate: '2020-07-01',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  contactEmail: 'info@example.com',
  programDate: '2099-07-15',
  registrationLink: 'https://tickets.example.com',
  registrationEnabled: true,
  domains: ['2026.cloudnativedays.no'],
  formats: [],
  topics: [],
  organizers: [],
  socialLinks: [],
  featuredSpeakers: mockFeaturedSpeakers,
  featuredGalleryImages: [
    mockGalleryImage('gal1', 'Keynote presentation on the main stage'),
    mockGalleryImage('gal2', 'Hands-on workshop session'),
    mockGalleryImage('gal3', 'Networking break'),
  ],
  sponsors: mockSponsors,
  sponsorTiers: [
    { _id: 'tier-ingress', title: 'Ingress' },
    { _id: 'tier-pod', title: 'Pod' },
  ],
  vanityMetrics: [
    { label: 'Attendees', value: '450+' },
    { label: 'Speakers', value: '40' },
    { label: 'Tracks', value: '4' },
  ],
} as unknown as Conference

const richContent: TypedObject[] = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'h2',
    markDefs: [],
    children: [{ _type: 'span', _key: 's1', text: 'Why attend?', marks: [] }],
  },
  {
    _type: 'block',
    _key: 'b2',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 's2',
        text: 'Two days of deep, vendor-neutral cloud native content from the people building the platforms Norway runs on.',
        marks: [],
      },
    ],
  },
]

const customSections: HomepageSection[] = [
  { _key: 'hero', _type: 'homepageHero' },
  {
    _key: 'cta',
    _type: 'homepageCtaBanner',
    heading: 'Call for Papers is open',
    body: 'Share your cloud native story with the community.',
    buttonLabel: 'Submit a talk',
    buttonHref: '/cfp',
  },
  {
    _key: 'gallery',
    _type: 'homepageGallery',
    heading: 'Photos from 2025',
    description: 'Talks, hallway track and the after-party, in pictures.',
  },
  {
    _key: 'featured',
    _type: 'homepageFeaturedSpeakers',
    heading: 'Who you will hear',
    description: 'A hand-picked line-up from across the industry.',
  },
  {
    _key: 'rich',
    _type: 'homepageRichText',
    heading: 'About the conference',
    content: richContent,
  },
  { _key: 'metrics', _type: 'homepageMetrics', heading: 'By the numbers' },
  {
    _key: 'countdown',
    _type: 'homepageCountdown',
    heading: 'The doors open in',
  },
  {
    _key: 'faq',
    _type: 'homepageFaq',
    heading: 'Frequently asked questions',
    source: 'own',
    items: [
      {
        _key: 'q1',
        question: 'Where is the conference held?',
        answer: 'At Grieghallen in the centre of Bergen, Norway.',
      },
      {
        _key: 'q2',
        question: 'Will talks be recorded?',
        answer: 'Yes — every talk is recorded and published afterwards.',
      },
    ],
  },
  {
    _key: 'venue',
    _type: 'homepageVenue',
    heading: 'Where to find us',
    description: 'A short walk from Bergen train station.',
  },
  {
    _key: 'sponsors',
    _type: 'homepageSponsors',
    heading: 'Our partners',
    description: 'The organisations that make this conference possible.',
    ctaHeading: 'Partner with us',
    ctaDescription:
      'Put your brand in front of the practitioners who build and run the systems your product serves.',
  },
]

const meta = {
  title: 'Systems/Homepage/Public/HomepageComposition',
  component: HomepageSectionRenderer,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Front-page builder (F2) whole-page renderer. The default composition reproduces the legacy layout pixel-for-pixel; a custom composition can insert CTA/rich-text blocks, hide sections and override each section’s copy.',
      },
    },
  },
} satisfies Meta<typeof HomepageSectionRenderer>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The zero-config baseline: no stored composition, so every section renders its
 * built-in house copy. This is the story that proves the per-section copy
 * config changes nothing for a conference that has not configured it.
 */
export const Default: Story = {
  args: {
    conference: baseConference,
    sections: getDefaultSections(baseConference),
    ticketsFromPrice: '3 490',
  },
}

export const DefaultDark: Story = {
  args: {
    conference: baseConference,
    sections: getDefaultSections(baseConference),
    ticketsFromPrice: '3 490',
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export const Custom: Story = {
  args: {
    conference: baseConference,
    sections: customSections,
    ticketsFromPrice: '3 490',
  },
}

export const CustomDark: Story = {
  args: {
    conference: baseConference,
    sections: customSections,
    ticketsFromPrice: '3 490',
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
