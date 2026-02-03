/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { SponsorProspectus } from '@/components/sponsor/SponsorProspectus'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'

// Mock icons
jest.mock('@heroicons/react/24/outline', () => ({
  UserGroupIcon: (props: any) => (
    <svg {...props} data-testid="icon-user-group" />
  ),
}))

// Mock Sponsors component
jest.mock('@/components/Sponsors', () => ({
  Sponsors: () => <div data-testid="sponsors-grid">Sponsors Grid</div>,
}))

// Mock BackgroundImage
jest.mock('@/components/BackgroundImage', () => ({
  BackgroundImage: () => <div data-testid="background-image" />,
}))

// Mock Next/Image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}))

const mockConference = {
  _id: 'conf-1',
  title: 'Test Conference',
  city: 'Bergen',
  sponsor_email: 'sponsor@test.com',
  sponsor_benefits: [
    {
      title: 'Benefit 1',
      description: 'Desc 1',
      icon: 'UserGroupIcon',
    },
  ],
  vanity_metrics: [
    {
      label: 'Attendees',
      value: '500+',
    },
  ],
  featuredGalleryImages: [
    {
      _id: 'img1',
      image: 'image-url',
      caption: 'Vibe 1',
    },
  ],
} as unknown as Conference

const mockStandardTiers = [
  {
    _id: 't1',
    title: 'Gold',
    tier_type: 'standard',
    tagline: 'Best tier',
    price: [{ amount: 10000, currency: 'NOK' }],
    perks: [{ label: 'Perk 1', description: 'Desc P1' }],
    sold_out: false,
    most_popular: true,
  },
] as unknown as SponsorTier[]

const mockAddonTiers = [
  {
    _id: 'a1',
    title: 'Booth',
    tier_type: 'addon',
    tagline: 'Extra booth',
    price: [{ amount: 5000, currency: 'NOK' }],
    sold_out: false,
  },
] as unknown as SponsorTier[]

const mockSpecialTiers = [
  {
    _id: 's1',
    title: 'Media',
    tier_type: 'special',
    tagline: 'Media partner',
    sold_out: false,
  },
] as unknown as SponsorTier[]

const mockPastSponsors = [
  {
    sponsor: { name: 'Past Sponsor' },
    tier: { title: 'Gold' },
  },
] as any

describe('SponsorProspectus', () => {
  it('renders the prospectus with all sections', () => {
    render(
      <SponsorProspectus
        conference={mockConference}
        standardTiers={mockStandardTiers}
        specialTiers={mockSpecialTiers}
        addonTiers={mockAddonTiers}
        pastSponsors={mockPastSponsors}
      />,
    )

    // Check Hero
    expect(screen.getByText('Become a Sponsor')).toBeInTheDocument()
    expect(screen.getByText(/Showcase your brand/)).toBeInTheDocument()

    // Check Benefits
    expect(screen.getByText('Benefit 1')).toBeInTheDocument()
    expect(screen.getByText('Desc 1')).toBeInTheDocument()
    expect(screen.getByTestId('icon-user-group')).toBeInTheDocument()

    // Check Vanity Metrics
    expect(screen.getByText('Attendees')).toBeInTheDocument()
    expect(screen.getByText('500+')).toBeInTheDocument()

    // Check Standard Tiers
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('10 000 NOK')).toBeInTheDocument() // PriceFormat adds spaces
    expect(screen.getByText('Most popular')).toBeInTheDocument()

    // Check Addons
    expect(screen.getByText('Add-on Opportunities')).toBeInTheDocument()
    expect(screen.getByText('Booth')).toBeInTheDocument()
    expect(screen.getByText('5 000 NOK')).toBeInTheDocument()

    // Check Special Tiers
    expect(screen.getByText('Special Partnership Opportunities')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()

    // Check Past Sponsors
    expect(screen.getByTestId('sponsors-grid')).toBeInTheDocument()

    // Check Vibe Check
    expect(screen.getByText('The Vibe')).toBeInTheDocument()
    expect(screen.getByAltText('Vibe 1')).toBeInTheDocument()
  })

  it('hides sections when data is missing', () => {
    render(
      <SponsorProspectus
        conference={{ ...mockConference, sponsor_benefits: [], vanity_metrics: [], featuredGalleryImages: [] }}
        standardTiers={[]}
        specialTiers={[]}
        addonTiers={[]}
        pastSponsors={[]}
      />,
    )

    expect(screen.queryByText('Benefit 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Attendees')).not.toBeInTheDocument()
    expect(screen.queryByText('Add-on Opportunities')).not.toBeInTheDocument()
    expect(screen.queryByText('Special Partnership Opportunities')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sponsors-grid')).not.toBeInTheDocument()
    expect(screen.queryByText('The Vibe')).not.toBeInTheDocument()
  })
})
