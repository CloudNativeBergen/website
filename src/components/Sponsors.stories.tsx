import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { Sponsors } from './Sponsors'
import type { Conference } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

const meta: Meta<typeof Sponsors> = {
  title: 'Systems/Sponsors/Public/Sponsors',
  component: Sponsors,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Public-facing sponsor showcase. Two variants: `tiers` (default) groups sponsors under their tier headings; `logo-wall` shows one flat grid at one size, with no tier headings at all. Only sponsors with status="closed-won" reach this component. The "Become a Sponsor" card is an independent toggle (`showCTA`) and is identical in both variants.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: [undefined, 'tiers', 'logo-wall'],
      description: 'Presentation variant. Absent = `tiers` (the default).',
    },
    showCTA: {
      control: 'boolean',
      description: 'Show call-to-action for prospective sponsors',
    },
    heading: { control: 'text', description: 'Band heading override' },
    description: { control: 'text', description: 'Band sub-heading override' },
    ctaHeading: { control: 'text', description: 'CTA card heading override' },
    ctaDescription: { control: 'text', description: 'CTA card body override' },
  },
}

export default meta
type Story = StoryObj<typeof Sponsors>

/* ------------------------------------------------------------------ *
 * Sponsor logos.
 *
 * Real sponsors send a vector wordmark plus a light-on-dark version, so
 * that is what these fixtures are: a geometric mark next to a wordmark,
 * in an ink pair (`logo` for light mode, `logoBright` for dark). Flat
 * text placeholders would hide exactly the problems a logo grid has —
 * wildly different wordmark lengths, marks that need vertical room, and
 * dark logos disappearing on a dark background.
 * ------------------------------------------------------------------ */

type MarkName =
  'hex' | 'wave' | 'cube' | 'dots' | 'chevron' | 'layers' | 'shield' | 'pixel'

function markShape(mark: MarkName, color: string, accent: string): string {
  switch (mark) {
    case 'hex':
      return `<path d="M22 3 40 13v20L22 43 4 33V13Z" fill="${color}"/><path d="M22 12 32 18v12l-10 6-10-6V18Z" fill="${accent}"/>`
    case 'wave':
      return `<path d="M2 30c7-10 13-10 20 0s13 10 20 0" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M2 16c7-10 13-10 20 0s13 10 20 0" stroke="${accent}" stroke-width="6" fill="none" stroke-linecap="round"/>`
    case 'cube':
      return `<path d="M22 3 41 14v22L22 47 3 36V14Z" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><path d="M22 14v11l10 6" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    case 'dots':
      return `<g fill="${color}"><circle cx="10" cy="12" r="5"/><circle cx="24" cy="12" r="5"/><circle cx="10" cy="26" r="5"/><circle cx="38" cy="26" r="5"/><circle cx="24" cy="40" r="5"/></g><g fill="${accent}"><circle cx="38" cy="12" r="5"/><circle cx="24" cy="26" r="5"/></g>`
    case 'chevron':
      return `<path d="M6 8 24 24 6 40" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 40h14" stroke="${accent}" stroke-width="7" fill="none" stroke-linecap="round"/>`
    case 'layers':
      return `<rect x="4" y="6" width="36" height="9" rx="4" fill="${color}"/><rect x="4" y="19" width="36" height="9" rx="4" fill="${accent}"/><rect x="4" y="32" width="36" height="9" rx="4" fill="${color}" opacity="0.55"/>`
    case 'shield':
      return `<path d="M22 3 39 9v14c0 11-7 18-17 22C12 41 5 34 5 23V9Z" fill="${color}"/><path d="m14 24 6 6 12-12" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'pixel':
      return `<g fill="${color}"><rect x="4" y="4" width="17" height="17" rx="3"/><rect x="25" y="25" width="17" height="17" rx="3"/></g><g fill="${accent}"><rect x="25" y="4" width="17" height="17" rx="3"/><rect x="4" y="25" width="17" height="17" rx="3"/></g>`
  }
}

function logoSvg(
  name: string,
  mark: MarkName,
  markColor: string,
  markAccent: string,
  inkColor: string,
  tracking = -0.6,
): string {
  // Generous: a wordmark that overruns its own viewBox is clipped by the SVG
  // viewport, which would look like a component bug in the screenshots.
  const width = Math.round(64 + name.length * 17.5)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 48" width="${width}" height="48">` +
    `<g transform="translate(0,1)">${markShape(mark, markColor, markAccent)}</g>` +
    `<text x="56" y="33" font-family="Inter, Helvetica, Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="${tracking}" fill="${inkColor}">${name}</text>` +
    `</svg>`
  )
}

const INK = '#0f172a'

function sponsorFixture(
  id: string,
  name: string,
  domain: string,
  mark: MarkName,
  brand: string,
  brandSoft: string,
  tier: { title: string; tierType?: string },
) {
  return {
    _id: `cs-${id}`,
    sponsor: {
      _id: `s-${id}`,
      name,
      website: `https://${domain}`,
      logo: logoSvg(name, mark, brand, brandSoft, INK),
      logoBright: logoSvg(name, mark, brandSoft, brand, '#ffffff'),
    },
    tier,
  }
}

const mockConference: Partial<Conference> = {
  _id: 'conf-2026',
  title: 'Cloud Native Days Norway 2026',
  city: 'Bergen',
  startDate: '2026-06-10',
  endDate: '2026-06-11',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  sponsorTiers: [
    {
      _id: 'tier-ingress',
      title: 'Ingress',
      tagline: 'Premium tier',
      tierType: 'standard' as const,
      price: [{ _key: 'price-1', amount: 100000, currency: 'NOK' }],
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-01T00:00:00Z',
      soldOut: false,
      mostPopular: false,
    },
    {
      _id: 'tier-service',
      title: 'Service',
      tagline: 'Mid tier',
      tierType: 'standard' as const,
      price: [{ _key: 'price-2', amount: 50000, currency: 'NOK' }],
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-01T00:00:00Z',
      soldOut: false,
      mostPopular: false,
    },
    {
      _id: 'tier-pod',
      title: 'Pod',
      tagline: 'Base tier',
      tierType: 'standard' as const,
      price: [{ _key: 'price-3', amount: 25000, currency: 'NOK' }],
      _createdAt: '2026-01-01T00:00:00Z',
      _updatedAt: '2026-01-01T00:00:00Z',
      soldOut: false,
      mostPopular: false,
    },
  ],
}

const mockSponsors = [
  sponsorFixture(
    '1',
    'Nordkapp',
    'nordkapp.example',
    'hex',
    '#1d4ed8',
    '#60a5fa',
    {
      title: 'Ingress',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '2',
    'Fjordline',
    'fjordline.example',
    'wave',
    '#0f766e',
    '#5eead4',
    {
      title: 'Ingress',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '3',
    'Kubeworks',
    'kubeworks.example',
    'cube',
    '#4338ca',
    '#a5b4fc',
    {
      title: 'Service',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '4',
    'Blikk',
    'blikk.example',
    'chevron',
    '#b45309',
    '#fcd34d',
    {
      title: 'Service',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '5',
    'Terrafirm',
    'terrafirm.example',
    'layers',
    '#7e22ce',
    '#d8b4fe',
    {
      title: 'Service',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '6',
    'Havn Security',
    'havn.example',
    'shield',
    '#0369a1',
    '#7dd3fc',
    {
      title: 'Pod',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '7',
    'Bergen Byte',
    'bergenbyte.example',
    'pixel',
    '#15803d',
    '#86efac',
    {
      title: 'Pod',
      tierType: 'standard',
    },
  ),
  sponsorFixture(
    '8',
    'Skyfall',
    'skyfall.example',
    'dots',
    '#be123c',
    '#fda4af',
    {
      title: 'Pod',
      tierType: 'standard',
    },
  ),
] as unknown as ConferenceSponsor[]

/** A young event whose sponsors all sit in one de-facto tier. */
const youngEventSponsors = [
  mockSponsors[0],
  mockSponsors[2],
  mockSponsors[5],
  mockSponsors[6],
].map((s) => ({
  ...s,
  tier: { title: 'Partner', tierType: 'standard' },
})) as unknown as ConferenceSponsor[]

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

/* ---------------------------- tiers (default) --------------------------- */

/**
 * The DEFAULT variant, and the rendering every existing conference site gets:
 * sponsors grouped under their tier heading, on the dashed house grid.
 */
export const WithSponsors: Story = {
  args: {
    sponsors: mockSponsors,
    conference: mockConference as Conference,
    showCTA: true,
  },
}

export const WithSponsorsDark: Story = {
  ...dark,
  args: WithSponsors.args,
}

export const WithoutCTA: Story = {
  args: {
    sponsors: mockSponsors,
    conference: mockConference as Conference,
    showCTA: false,
  },
}

export const NoSponsors: Story = {
  args: {
    sponsors: [],
    conference: mockConference as Conference,
    showCTA: true,
  },
}

/**
 * The case `logo-wall` exists for: one tier, a handful of sponsors, and a tier
 * label sitting over a short row — hierarchy that describes nothing.
 */
export const SingleTier: Story = {
  args: {
    sponsors: youngEventSponsors,
    conference: mockConference as Conference,
    showCTA: true,
  },
}

/**
 * A tenant overriding the house copy from its `homepageSponsors` section
 * config. Omitting any of these props restores the defaults shown in
 * `WithSponsors` — the copy is configuration, not a fork.
 */
export const CustomCopy: Story = {
  args: {
    sponsors: mockSponsors,
    conference: mockConference as Conference,
    showCTA: true,
    heading: 'Our partners',
    description: 'The organisations that make this conference possible.',
    ctaHeading: 'Partner with us',
    ctaDescription:
      'Put your brand in front of the practitioners who build and run the systems your product serves.',
  },
}

/* ------------------------------- logo-wall ------------------------------ */

/**
 * `logo-wall`: one flat grid, one logo size, no tier headings and no tier rail
 * — equal billing, for events that promise it or whose sponsors all sit in one
 * de-facto tier. Tier VALUE survives only as the ordering key (highest first,
 * with the daily rotation preserved inside each tier); the tier NAMES are gone
 * from the page, including from the accessibility layer. The "Become a
 * Sponsor" card is untouched: it carries tenant copy and its own toggle.
 */
export const LogoWall: Story = {
  args: {
    sponsors: mockSponsors,
    conference: mockConference as Conference,
    variant: 'logo-wall',
    showCTA: true,
  },
}

export const LogoWallDark: Story = {
  ...dark,
  args: LogoWall.args,
}

/** The young-event case: four sponsors, no hierarchy to describe. */
export const LogoWallSmall: Story = {
  args: {
    sponsors: youngEventSponsors,
    conference: mockConference as Conference,
    variant: 'logo-wall',
    showCTA: true,
  },
}

export const LogoWallSmallDark: Story = {
  ...dark,
  args: LogoWallSmall.args,
}

/** Post-event, or an organizer who has closed the sponsor sale. */
export const LogoWallWithoutCTA: Story = {
  args: {
    sponsors: mockSponsors,
    conference: mockConference as Conference,
    variant: 'logo-wall',
    showCTA: false,
  },
}
