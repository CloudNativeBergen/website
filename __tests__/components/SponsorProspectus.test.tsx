/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { SponsorProspectus } from '@/components/sponsor/SponsorProspectus'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'

// Mock icons
vi.mock('@heroicons/react/24/outline', () => ({
  __esModule: true,
  UserGroupIcon: (props: any) => (
    <svg {...props} data-testid="icon-user-group" />
  ),
  CheckIcon: (props: any) => <svg {...props} data-testid="icon-check" />,
  NoSymbolIcon: (props: any) => <svg {...props} data-testid="icon-no-symbol" />,
  DocumentArrowDownIcon: (props: any) => (
    <svg {...props} data-testid="icon-document-arrow-down" />
  ),
  SparklesIcon: (props: any) => <svg {...props} data-testid="icon-sparkles" />,
}))

// Mock Sponsors component
vi.mock('@/components/Sponsors', () => ({
  __esModule: true,
  Sponsors: () => <div data-testid="sponsors-grid">Sponsors Grid</div>,
}))

// Mock BackgroundImage
vi.mock('@/components/BackgroundImage', () => ({
  BackgroundImage: () => <div data-testid="background-image" />,
}))

// Mock Next/Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}))

const mockConference = {
  _id: 'conf-1',
  title: 'Test Conference',
  city: 'Bergen',
  sponsorEmail: 'sponsor@test.com',
  sponsorBenefits: [
    {
      title: 'Benefit 1',
      description: 'Desc 1',
      icon: 'UserGroupIcon',
    },
  ],
  vanityMetrics: [
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
      imageAlt: 'Vibe 1',
    },
  ],
} as unknown as Conference

const mockStandardTiers = [
  {
    _id: 't1',
    title: 'Gold',
    tierType: 'standard',
    tagline: 'Best tier',
    price: [{ amount: 10000, currency: 'NOK' }],
    perks: [{ label: 'Perk 1', description: 'Desc P1' }],
    soldOut: false,
    mostPopular: true,
  },
] as unknown as SponsorTier[]

const mockAddonTiers = [
  {
    _id: 'a1',
    title: 'Booth',
    tierType: 'addon',
    tagline: 'Extra booth',
    price: [{ amount: 5000, currency: 'NOK' }],
    soldOut: false,
  },
] as unknown as SponsorTier[]

const mockSpecialTiers = [
  {
    _id: 's1',
    title: 'Media',
    tierType: 'special',
    tagline: 'Media partner',
    soldOut: false,
  },
] as unknown as SponsorTier[]

const mockPastSponsors = [
  {
    sponsor: { name: 'Past Sponsor' },
    tier: { title: 'Platinum' },
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
    expect(
      screen.getByText('No Sales Pitches. Just Code & Culture.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/We prioritize/)).toBeInTheDocument()

    // Check Benefits
    expect(screen.getByText('Benefit 1')).toBeInTheDocument()
    expect(screen.getByText('Desc 1')).toBeInTheDocument()

    // Check Vanity Metrics
    expect(screen.getByText('Attendees')).toBeInTheDocument()
    expect(screen.getByText('500+')).toBeInTheDocument()

    // Check Standard Tiers
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('10 000 NOK')).toBeInTheDocument() // PriceFormat adds spaces
    expect(screen.getByText('Recommended')).toBeInTheDocument()

    // Check Addons
    expect(
      screen.getByText(/> Custom Resource Definitions \(CRDs\)/),
    ).toBeInTheDocument()
    expect(screen.getByText('Booth')).toBeInTheDocument()
    expect(screen.getByText('5 000 NOK')).toBeInTheDocument()

    // Check Special Tiers
    expect(screen.getByText('Special Partnerships')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()

    // Check Vibe Check
    expect(screen.getByText('The Vibe')).toBeInTheDocument()
    expect(screen.getByAltText('Vibe 1')).toBeInTheDocument()
  })

  it('hides sections when data is missing', () => {
    render(
      <SponsorProspectus
        conference={{
          ...mockConference,
          sponsorBenefits: [],
          vanityMetrics: [],
          featuredGalleryImages: [],
        }}
        standardTiers={[]}
        specialTiers={[]}
        addonTiers={[]}
        pastSponsors={[]}
      />,
    )

    expect(screen.queryByText('Benefit 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Attendees')).not.toBeInTheDocument()
    expect(screen.queryByText('Add-on Opportunities')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Special Partnership Opportunities'),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('sponsors-grid')).not.toBeInTheDocument()
    expect(screen.queryByText('The Vibe')).not.toBeInTheDocument()
  })
})
