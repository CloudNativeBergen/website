import { describe, it, expect } from '@jest/globals'
import {
  checkContractReadiness,
  groupMissingBySource,
  type MissingField,
} from '@/lib/sponsor-crm/contract-readiness'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

describe('contract-readiness', () => {
  const createMockSponsor = (
    overrides: Partial<SponsorForConferenceExpanded> = {},
  ): SponsorForConferenceExpanded => ({
    _id: 'sfc-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    sponsor: {
      _id: 'sponsor-1',
      name: 'Acme Corp',
      website: 'https://acme.com',
      logo: 'logo.png',
      orgNumber: '123456789',
      address: 'Oslo, Norway',
    },
    conference: {
      _id: 'conf-1',
      title: 'Cloud Native Days Norway 2026',
      organizer: 'Cloud Native Bergen',
      organizerOrgNumber: '987654321',
      organizerAddress: 'Bergen, Norway',
      city: 'Bergen',
      venueName: 'Bergen Conference Center',
      venueAddress: 'Main St 1, Bergen',
      startDate: '2026-06-10',
      endDate: '2026-06-11',
      sponsorEmail: 'sponsors@cloudnativebergen.no',
    },
    tier: {
      _id: 'tier-1',
      title: 'Gold',
      tagline: 'Premium sponsorship',
      tierType: 'standard',
      price: [{ _key: '1', amount: 50000, currency: 'NOK' }],
    },
    contractStatus: 'none',
    status: 'prospect',
    invoiceStatus: 'not-sent',
    contractValue: 50000,
    contractCurrency: 'NOK',
    contactPersons: [
      {
        _key: 'contact-1',
        name: 'John Doe',
        email: 'john@acme.com',
        isPrimary: true,
      },
    ],
    ...overrides,
  })

  describe('checkContractReadiness', () => {
    it('should return ready=true when all required fields are present', () => {
      const sponsor = createMockSponsor()
      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(true)
      expect(result.missing).toHaveLength(0)
    })

    it('should detect missing organizer fields', () => {
      const sponsor = createMockSponsor({
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
          // Missing organizer, organizerOrgNumber, organizerAddress
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'conference.organizer',
            label: 'Organizer name',
            source: 'organizer',
          }),
          expect.objectContaining({
            field: 'conference.organizerOrgNumber',
            label: 'Organizer org. number',
            source: 'organizer',
          }),
          expect.objectContaining({
            field: 'conference.organizerAddress',
            label: 'Organizer address',
            source: 'organizer',
          }),
        ]),
      )
    })

    it('should detect missing sponsor fields', () => {
      const sponsor = createMockSponsor({
        sponsor: {
          _id: 'sponsor-1',
          name: 'Acme Corp',
          website: 'https://acme.com',
          logo: 'logo.png',
          // Missing orgNumber and address
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'sponsor.orgNumber',
            label: 'Sponsor org. number',
            source: 'sponsor',
          }),
          expect.objectContaining({
            field: 'sponsor.address',
            label: 'Sponsor address',
            source: 'sponsor',
          }),
        ]),
      )
    })

    it('should detect missing contact person', () => {
      const sponsor = createMockSponsor({
        contactPersons: [],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toContainEqual(
        expect.objectContaining({
          field: 'contactPersons',
          label: 'Primary contact person',
          source: 'sponsor',
        }),
      )
    })

    it('should accept contact person without isPrimary if only one contact', () => {
      const sponsor = createMockSponsor({
        contactPersons: [
          {
            _key: 'contact-1',
            name: 'John Doe',
            email: 'john@acme.com',
            // iPrimary not set, but only one contact
          },
        ],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(true)
    })

    it('should require primary contact when multiple contacts exist', () => {
      const sponsor = createMockSponsor({
        contactPersons: [
          {
            _key: 'contact-1',
            name: 'John Doe',
            email: 'john@acme.com',
            // No isPrimary
          },
          {
            _key: 'contact-2',
            name: 'Jane Smith',
            email: 'jane@acme.com',
            // No isPrimary
          },
        ],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toContainEqual(
        expect.objectContaining({
          field: 'contactPersons',
          source: 'sponsor',
        }),
      )
    })

    it('should detect missing pipeline fields', () => {
      const sponsor = createMockSponsor({
        tier: undefined,
        contractValue: 0,
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'tier',
            label: 'Sponsor tier',
            source: 'pipeline',
          }),
          expect.objectContaining({
            field: 'contractValue',
            label: 'Contract value',
            source: 'pipeline',
          }),
        ]),
      )
    })

    it('should handle missing venue and dates gracefully', () => {
      const sponsor = createMockSponsor({
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
          organizer: 'Cloud Native Bergen',
          organizerOrgNumber: '987654321',
          organizerAddress: 'Bergen, Norway',
          sponsorEmail: 'sponsors@cloudnativebergen.no',
          // Missing startDate, venueName
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'conference.startDate',
            source: 'organizer',
          }),
          expect.objectContaining({
            field: 'conference.venueName',
            source: 'organizer',
          }),
        ]),
      )
    })

    it('should handle all missing fields across all sources', () => {
      const sponsor = createMockSponsor({
        sponsor: {
          _id: 'sponsor-1',
          name: 'Acme Corp',
          website: 'https://acme.com',
          logo: 'logo.png',
        },
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
        },
        tier: undefined,
        contractValue: undefined,
        contactPersons: [],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.missing.length).toBeGreaterThan(5)

      const sources = new Set(result.missing.map((m) => m.source))
      expect(sources).toContain('organizer')
      expect(sources).toContain('sponsor')
      expect(sources).toContain('pipeline')
    })
  })

  describe('groupMissingBySource', () => {
    it('should group missing fields by source', () => {
      const missing: MissingField[] = [
        {
          field: 'conference.organizer',
          label: 'Organizer name',
          source: 'organizer',
        },
        {
          field: 'sponsor.orgNumber',
          label: 'Sponsor org. number',
          source: 'sponsor',
        },
        { field: 'tier', label: 'Sponsor tier', source: 'pipeline' },
        {
          field: 'conference.startDate',
          label: 'Conference start date',
          source: 'organizer',
        },
      ]

      const grouped = groupMissingBySource(missing)

      expect(grouped.organizer).toHaveLength(2)
      expect(grouped.sponsor).toHaveLength(1)
      expect(grouped.pipeline).toHaveLength(1)
    })

    it('should return empty arrays for sources with no missing fields', () => {
      const missing: MissingField[] = [
        { field: 'tier', label: 'Sponsor tier', source: 'pipeline' },
      ]

      const grouped = groupMissingBySource(missing)

      expect(grouped.organizer).toHaveLength(0)
      expect(grouped.sponsor).toHaveLength(0)
      expect(grouped.pipeline).toHaveLength(1)
    })
  })
})
