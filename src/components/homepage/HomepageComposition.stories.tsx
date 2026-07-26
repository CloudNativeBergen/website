import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HomepageSectionRenderer } from './SectionRenderer'
import {
  getDefaultSections,
  type HomepageSection,
} from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'
import type { TypedObject } from 'sanity'

/**
 * Whole-homepage composition stories for visual QA (`rtk pnpm shoot`). `Default`
 * renders exactly the legacy layout via `getDefaultSections`; `Custom` inserts a
 * CTA banner and rich-text block and hides a section — the two are diffed to
 * confirm the default path is unchanged and the new blocks sit correctly.
 */

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
  startDate: '2099-09-15',
  endDate: '2099-09-15',
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
  sponsors: [],
  sponsorTiers: [],
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
  { _key: 'gallery', _type: 'homepageGallery', hidden: true },
  {
    _key: 'rich',
    _type: 'homepageRichText',
    heading: 'About the conference',
    content: richContent,
  },
  { _key: 'metrics', _type: 'homepageMetrics', heading: 'By the numbers' },
  { _key: 'sponsors', _type: 'homepageSponsors' },
]

const meta = {
  title: 'Systems/Homepage/Public/HomepageComposition',
  component: HomepageSectionRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F2) whole-page renderer. The default composition reproduces the legacy layout pixel-for-pixel; a custom composition can insert CTA/rich-text blocks and hide sections.',
      },
    },
  },
} satisfies Meta<typeof HomepageSectionRenderer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    conference: baseConference,
    sections: getDefaultSections(baseConference),
    ticketsFromPrice: '3 490',
  },
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
