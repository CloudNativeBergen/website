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
    it('should return ready=true and canSend=true when all fields are present', () => {
      const sponsor = createMockSponsor()
      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(true)
      expect(result.canSend).toBe(true)
      expect(result.missing).toHaveLength(0)
    })

    it('should detect missing organizer fields as recommended', () => {
      const sponsor = createMockSponsor({
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(true)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'conference.organizer',
            label: 'Organizer name',
            source: 'organizer',
            severity: 'recommended',
          }),
          expect.objectContaining({
            field: 'conference.organizerOrgNumber',
            label: 'Organizer org. number',
            source: 'organizer',
            severity: 'recommended',
          }),
          expect.objectContaining({
            field: 'conference.organizerAddress',
            label: 'Organizer address',
            source: 'organizer',
            severity: 'recommended',
          }),
        ]),
      )
    })

    it('should detect missing sponsor fields as recommended', () => {
      const sponsor = createMockSponsor({
        sponsor: {
          _id: 'sponsor-1',
          name: 'Acme Corp',
          website: 'https://acme.com',
          logo: 'logo.png',
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(true)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'sponsor.orgNumber',
            label: 'Sponsor org. number',
            source: 'sponsor',
            severity: 'recommended',
          }),
          expect.objectContaining({
            field: 'sponsor.address',
            label: 'Sponsor address',
            source: 'sponsor',
            severity: 'recommended',
          }),
        ]),
      )
    })

    it('should detect missing contact person as required and block canSend', () => {
      const sponsor = createMockSponsor({
        contactPersons: [],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(false)
      expect(result.missing).toContainEqual(
        expect.objectContaining({
          field: 'contactPersons',
          label: 'Primary contact person',
          source: 'sponsor',
          severity: 'required',
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
          },
        ],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(true)
      expect(result.canSend).toBe(true)
    })

    it('should require primary contact when multiple contacts exist', () => {
      const sponsor = createMockSponsor({
        contactPersons: [
          {
            _key: 'contact-1',
            name: 'John Doe',
            email: 'john@acme.com',
          },
          {
            _key: 'contact-2',
            name: 'Jane Smith',
            email: 'jane@acme.com',
          },
        ],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(false)
      expect(result.missing).toContainEqual(
        expect.objectContaining({
          field: 'contactPersons',
          source: 'sponsor',
          severity: 'required',
        }),
      )
    })

    it('should detect missing pipeline fields as recommended', () => {
      const sponsor = createMockSponsor({
        tier: undefined,
        contractValue: 0,
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(true)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'tier',
            label: 'Sponsor tier',
            source: 'pipeline',
            severity: 'recommended',
          }),
          expect.objectContaining({
            field: 'contractValue',
            label: 'Contract value',
            source: 'pipeline',
            severity: 'recommended',
          }),
        ]),
      )
    })

    it('should allow sending with only contact person and conference title', () => {
      const sponsor = createMockSponsor({
        sponsor: {
          _id: 'sponsor-1',
          name: 'New Sponsor',
          website: '',
          logo: '',
        },
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
        },
        tier: undefined,
        contractValue: undefined,
        contactPersons: [
          {
            _key: 'contact-1',
            name: 'Jane Smith',
            email: 'jane@newsponsor.com',
            isPrimary: true,
          },
        ],
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(true)
      expect(result.missing.length).toBeGreaterThan(0)
      expect(result.missing.every((m) => m.severity === 'recommended')).toBe(
        true,
      )
    })

    it('should handle missing venue and dates as recommended', () => {
      const sponsor = createMockSponsor({
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
          organizer: 'Cloud Native Bergen',
          organizerOrgNumber: '987654321',
          organizerAddress: 'Bergen, Norway',
          sponsorEmail: 'sponsors@cloudnativebergen.no',
        },
      })

      const result = checkContractReadiness(sponsor)

      expect(result.ready).toBe(false)
      expect(result.canSend).toBe(true)
      expect(result.missing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'conference.startDate',
            source: 'organizer',
            severity: 'recommended',
          }),
          expect.objectContaining({
            field: 'conference.venueName',
            source: 'organizer',
            severity: 'recommended',
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
      expect(result.canSend).toBe(false)
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
          severity: 'recommended',
        },
        {
          field: 'sponsor.orgNumber',
          label: 'Sponsor org. number',
          source: 'sponsor',
          severity: 'recommended',
        },
        {
          field: 'tier',
          label: 'Sponsor tier',
          source: 'pipeline',
          severity: 'recommended',
        },
        {
          field: 'conference.startDate',
          label: 'Conference start date',
          source: 'organizer',
          severity: 'recommended',
        },
      ]

      const grouped = groupMissingBySource(missing)

      expect(grouped.organizer).toHaveLength(2)
      expect(grouped.sponsor).toHaveLength(1)
      expect(grouped.pipeline).toHaveLength(1)
    })

    it('should return empty arrays for sources with no missing fields', () => {
      const missing: MissingField[] = [
        {
          field: 'tier',
          label: 'Sponsor tier',
          source: 'pipeline',
          severity: 'recommended',
        },
      ]

      const grouped = groupMissingBySource(missing)

      expect(grouped.organizer).toHaveLength(0)
      expect(grouped.sponsor).toHaveLength(0)
      expect(grouped.pipeline).toHaveLength(1)
    })
  })
})
