import type {
  SponsorForConferenceExpanded,
  SponsorTag,
  SponsorStatus,
  ContractStatus,
  InvoiceStatus,
  SignatureStatus,
} from '@/lib/sponsor-crm/types'
import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'
import type { ContractReadiness, MissingField } from '@/lib/sponsor-crm/contract-readiness'

/**
 * Mock data factories for sponsor-related components in Storybook
 */

export function mockContactPerson(overrides: Partial<ContactPerson> = {}): ContactPerson {
  return {
    _key: `contact-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    phone: '+47 12 34 56 78',
    role: 'Marketing Manager',
    isPrimary: false,
    ...overrides,
  }
}

export function mockBillingInfo(overrides: Partial<BillingInfo> = {}): BillingInfo {
  return {
    email: 'billing@example.com',
    reference: 'PO-2026-001',
    comments: 'Invoice quarterly',
    ...overrides,
  }
}

import type { SponsorTier } from '@/lib/sponsor/types'

export function mockSponsorTier(overrides: Partial<SponsorTier> = {}): SponsorTier {
  return {
    _id: 'tier-ingress',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Ingress',
    tagline: 'Premium sponsorship tier',
    tierType: 'standard' as const,
    price: [
      {
        _key: 'price-nok',
        amount: 100000,
        currency: 'NOK',
      },
    ],
    soldOut: false,
    mostPopular: false,
    ...overrides,
  } as SponsorTier
}

export function mockSponsor(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'sfc-123',
    _createdAt: '2026-01-15T10:00:00Z',
    _updatedAt: '2026-02-10T14:30:00Z',
    sponsor: {
      _id: 'sponsor-123',
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      logo: '<svg>...</svg>',
      logoBright: '<svg>...</svg>',
      orgNumber: '123456789',
      address: 'Tech Street 42, 5020 Bergen',
    },
    conference: {
      _id: 'conf-2026',
      title: 'Cloud Native Days Norway 2026',
      organizer: 'Cloud Native Bergen',
      organizerOrgNumber: '987654321',
      organizerAddress: 'Event Plaza 1, 5003 Bergen',
      city: 'Bergen',
      venueName: 'Bergen Conference Center',
      venueAddress: 'Conference Way 10, 5010 Bergen',
      startDate: '2026-06-10',
      endDate: '2026-06-11',
      sponsorEmail: 'sponsor@cloudnativedays.no',
    },
    tier: mockSponsorTier() as SponsorTier & {
      tierType: 'standard' | 'special'
    },
    addons: [],
    contractStatus: 'verbal-agreement' as ContractStatus,
    signatureStatus: 'not-started' as SignatureStatus,
    status: 'negotiating' as SponsorStatus,
    contractValue: 100000,
    contractCurrency: 'NOK',
    invoiceStatus: 'not-sent' as InvoiceStatus,
    contactPersons: [mockContactPerson({ isPrimary: true })],
    billing: mockBillingInfo(),
    tags: ['warm-lead', 'returning-sponsor'] as SponsorTag[],
    notes: 'Very interested in premium package',
    onboardingComplete: false,
    ...overrides,
  }
}

export function mockReadinessReady(): ContractReadiness {
  return {
    ready: true,
    missing: [],
  }
}

export function mockReadinessMissing(
  fields?: MissingField[],
): ContractReadiness {
  const defaultMissing: MissingField[] = fields || [
    { field: 'sponsor.orgNumber', label: 'Organization number', source: 'sponsor' },
    { field: 'sponsor.address', label: 'Address', source: 'sponsor' },
    { field: 'conference.organizerOrgNumber', label: 'Organizer org number', source: 'organizer' },
    { field: 'tier', label: 'Sponsor tier', source: 'pipeline' },
  ]

  return {
    ready: false,
    missing: defaultMissing,
  }
}

export const mockSponsors = {
  prospect: mockSponsor({
    status: 'prospect',
    contractStatus: 'none',
    tags: ['cold-outreach'],
  }),
  contacted: mockSponsor({
    status: 'contacted',
    contractStatus: 'none',
    contactInitiatedAt: '2026-01-20T09:00:00Z',
    tags: ['warm-lead'],
  }),
  negotiating: mockSponsor({
    status: 'negotiating',
    contractStatus: 'verbal-agreement',
    tags: ['warm-lead', 'high-priority'],
  }),
  closedWon: mockSponsor({
    status: 'closed-won',
    contractStatus: 'contract-signed',
    signatureStatus: 'signed',
    invoiceStatus: 'paid',
    contractSignedAt: '2026-02-01T12:00:00Z',
    invoicePaidAt: '2026-02-15T10:30:00Z',
    tags: ['returning-sponsor'],
  }),
  closedLost: mockSponsor({
    status: 'closed-lost',
    contractStatus: 'none',
    tags: ['previously-declined'],
    notes: 'Budget constraints for 2026',
  }),
}
