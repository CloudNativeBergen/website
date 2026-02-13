import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Sponsors } from './Sponsors'
import type { Conference } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

const meta: Meta<typeof Sponsors> = {
  title: 'Systems/Sponsors/Components/Sponsors',
  component: Sponsors,
  parameters: {
    docs: {
      description: {
        component:
          'Public-facing sponsor showcase displaying active conference sponsors organized by tier. Features responsive grid layouts with tier-specific styling. Only shows sponsors with status="closed-won" to conference attendees. Supports optional CTA for prospective sponsors.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    showCTA: {
      control: 'boolean',
      description: 'Show call-to-action for prospective sponsors',
    },
  },
}

export default meta
type Story = StoryObj<typeof Sponsors>

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
  {
    _id: 'cs-1',
    sponsor: {
      _id: 's-1',
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#2563eb">ACME</text></svg>',
    },
    tier: { title: 'Ingress', tagline: 'Premium' },
  },
  {
    _id: 'cs-2',
    sponsor: {
      _id: 's-2',
      name: 'Tech Solutions',
      website: 'https://tech.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#10b981">TECH</text></svg>',
    },
    tier: { title: 'Ingress', tagline: 'Premium' },
  },
  {
    _id: 'cs-3',
    sponsor: {
      _id: 's-3',
      name: 'Cloud Services Inc',
      website: 'https://cloud.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#8b5cf6">CLOUD</text></svg>',
    },
    tier: { title: 'Service', tagline: 'Mid' },
  },
  {
    _id: 'cs-4',
    sponsor: {
      _id: 's-4',
      name: 'DevOps Masters',
      website: 'https://devops.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#f59e0b">DevOps</text></svg>',
    },
    tier: { title: 'Service', tagline: 'Mid' },
  },
  {
    _id: 'cs-5',
    sponsor: {
      _id: 's-5',
      name: 'Container Platform',
      website: 'https://containers.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#ef4444">CNTR</text></svg>',
    },
    tier: { title: 'Pod', tagline: 'Base' },
  },
  {
    _id: 'cs-6',
    sponsor: {
      _id: 's-6',
      name: 'Kubernetes Experts',
      website: 'https://k8s.example.com',
      logo: '<svg width="100" height="40"><text x="10" y="25" fill="#06b6d4">K8s</text></svg>',
    },
    tier: { title: 'Pod', tagline: 'Base' },
  },
]

export const WithSponsors: Story = {
  args: {
    sponsors: mockSponsors as ConferenceSponsor[],
    conference: mockConference as Conference,
    showCTA: true,
  },
}

export const WithoutCTA: Story = {
  args: {
    sponsors: mockSponsors as ConferenceSponsor[],
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

export const SingleTier: Story = {
  args: {
    sponsors: mockSponsors.slice(0, 2) as ConferenceSponsor[],
    conference: mockConference as Conference,
    showCTA: true,
  },
}
