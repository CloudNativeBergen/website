import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorBanner } from './SponsorBanner'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

const mockSponsors: ConferenceSponsor[] = [
  {
    _sfcId: 'cs-1',
    sponsor: {
      _id: 'sponsor-1',
      name: 'Equinor',
      website: 'https://equinor.com',
      logo: '<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="40" fill="#E31836"/><text x="60" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="14" font-weight="bold">EQUINOR</text></svg>',
    },
    tier: {
      _id: 'tier-1',
      title: 'Platinum',
      tagline: 'Top tier sponsor',
      tierType: 'standard',
      price: [{ _key: 'nok', amount: 150000, currency: 'NOK' }],
    },
  },
  {
    _sfcId: 'cs-2',
    sponsor: {
      _id: 'sponsor-2',
      name: 'DNB',
      website: 'https://dnb.no',
      logo: '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40" fill="#007272"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">DNB</text></svg>',
    },
    tier: {
      _id: 'tier-2',
      title: 'Gold',
      tagline: 'Premium sponsor',
      tierType: 'standard',
      price: [{ _key: 'nok', amount: 100000, currency: 'NOK' }],
    },
  },
  {
    _sfcId: 'cs-3',
    sponsor: {
      _id: 'sponsor-3',
      name: 'Bekk',
      website: 'https://bekk.no',
      logo: '<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="40" fill="#000"/><text x="40" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="14" font-weight="bold">BEKK</text></svg>',
    },
    tier: {
      _id: 'tier-3',
      title: 'Silver',
      tagline: 'Supporting sponsor',
      tierType: 'standard',
      price: [{ _key: 'nok', amount: 50000, currency: 'NOK' }],
    },
  },
  {
    _sfcId: 'cs-4',
    sponsor: {
      _id: 'sponsor-4',
      name: 'Bouvet',
      website: 'https://bouvet.no',
      logo: '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40" fill="#FF6B00"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">BOUVET</text></svg>',
    },
    tier: {
      _id: 'tier-3',
      title: 'Silver',
      tagline: 'Supporting sponsor',
      tierType: 'standard',
      price: [{ _key: 'nok', amount: 50000, currency: 'NOK' }],
    },
  },
]

const meta: Meta<typeof SponsorBanner> = {
  title: 'Systems/Sponsors/Public/SponsorBanner',
  component: SponsorBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Animated marquee banner displaying sponsor logos. Used during live streaming to showcase sponsors. Features smooth infinite scrolling animation with configurable speed. Automatically respects reduced motion preferences.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-gray-900 p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorBanner>

export const Default: Story = {
  args: {
    sponsors: mockSponsors,
  },
}

export const SlowSpeed: Story = {
  args: {
    sponsors: mockSponsors,
    speed: 60,
  },
}

export const FastSpeed: Story = {
  args: {
    sponsors: mockSponsors,
    speed: 15,
  },
}

export const SingleSponsor: Story = {
  args: {
    sponsors: [mockSponsors[0]],
  },
}

export const ManySponsors: Story = {
  args: {
    sponsors: [
      ...mockSponsors,
      {
        _sfcId: 'cs-5',
        sponsor: {
          _id: 'sponsor-5',
          name: 'Microsoft',
          website: 'https://microsoft.com',
          logo: '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40" fill="#00A4EF"/><text x="50" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">MICROSOFT</text></svg>',
        },
        tier: mockSponsors[0].tier,
      },
      {
        _sfcId: 'cs-6',
        sponsor: {
          _id: 'sponsor-6',
          name: 'Google Cloud',
          website: 'https://cloud.google.com',
          logo: '<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="40" fill="#4285F4"/><text x="60" y="25" text-anchor="middle" fill="white" font-family="Arial" font-size="10" font-weight="bold">GOOGLE CLOUD</text></svg>',
        },
        tier: mockSponsors[0].tier,
      },
    ],
  },
}

export const Empty: Story = {
  args: {
    sponsors: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'When no sponsors are provided, the banner renders nothing.',
      },
    },
  },
}
