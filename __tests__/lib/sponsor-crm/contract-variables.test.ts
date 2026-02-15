import { describe, it, expect } from '@jest/globals'
import {
  buildContractVariables,
  CONTRACT_VARIABLE_DESCRIPTIONS,
  type ContractVariableContext,
} from '@/lib/sponsor-crm/contract-variables'

describe('contract-variables', () => {
  describe('buildContractVariables', () => {
    const createBasicContext = (): ContractVariableContext => ({
      sponsor: {
        name: 'Acme Corporation',
        orgNumber: '123456789',
        address: 'Main Street 123, Oslo, Norway',
        website: 'https://acme.com',
      },
      contactPerson: {
        name: 'John Doe',
        email: 'john.doe@acme.com',
      },
      tier: {
        title: 'Gold Sponsor',
        tagline: 'Premium partnership package',
      },
      addons: [
        { title: 'Workshop Sponsorship' },
        { title: 'Party Sponsorship' },
      ],
      contractValue: 75000,
      contractCurrency: 'NOK',
      conference: {
        title: 'Cloud Native Days Norway 2026',
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        city: 'Bergen',
        organizer: 'Cloud Native Bergen',
        organizerOrgNumber: '987654321',
        organizerAddress: 'Conference Street 1, Bergen, Norway',
        venueName: 'Bergen Conference Center',
        venueAddress: 'Venue Road 10, Bergen',
        sponsorEmail: 'sponsors@cloudnativebergen.no',
      },
    })

    it('should build all basic required variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.SPONSOR_NAME).toBe('Acme Corporation')
      expect(vars.CONFERENCE_TITLE).toBe('Cloud Native Days Norway 2026')
      expect(vars.TODAY_DATE).toBeDefined()
    })

    it('should build sponsor variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.SPONSOR_ORG_NUMBER).toBe('123\u00A0456\u00A0789')
      expect(vars.SPONSOR_ADDRESS).toBe('Main Street 123, Oslo, Norway')
      expect(vars.SPONSOR_WEBSITE).toBe('https://acme.com')
    })

    it('should build contact person variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.CONTACT_NAME).toBe('John Doe')
      expect(vars.CONTACT_EMAIL).toBe('john.doe@acme.com')
    })

    it('should build tier variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.TIER_NAME).toBe('Gold Sponsor')
      expect(vars.TIER_TAGLINE).toBe('Premium partnership package')
    })

    it('should build addons list', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.ADDONS_LIST).toBe('Workshop Sponsorship, Party Sponsorship')
    })

    it('should format contract value with currency', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.CONTRACT_VALUE).toContain('75')
      expect(vars.CONTRACT_VALUE).toContain('000')
      expect(vars.CONTRACT_VALUE_NUMBER).toBe('75000')
      expect(vars.CONTRACT_CURRENCY).toBe('NOK')
    })

    it('should handle different currencies', () => {
      const ctx = createBasicContext()
      ctx.contractCurrency = 'USD'
      ctx.contractValue = 10000

      const vars = buildContractVariables(ctx)

      expect(vars.CONTRACT_CURRENCY).toBe('USD')
      expect(vars.CONTRACT_VALUE_NUMBER).toBe('10000')
    })

    it('should build conference date variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.CONFERENCE_DATE).toContain('10')
      expect(vars.CONFERENCE_DATE).toContain('June')
      expect(vars.CONFERENCE_DATE).toContain('2026')
      expect(vars.CONFERENCE_YEAR).toBe('2026')
    })

    it('should build date range for multi-day conference in same month', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      // 10–11 June 2026
      expect(vars.CONFERENCE_DATES).toContain('10')
      expect(vars.CONFERENCE_DATES).toContain('11')
      expect(vars.CONFERENCE_DATES).toContain('June')
      expect(vars.CONFERENCE_DATES).toContain('2026')
    })

    it('should build date range for conference spanning multiple months', () => {
      const ctx = createBasicContext()
      ctx.conference.startDate = '2026-05-31'
      ctx.conference.endDate = '2026-06-01'

      const vars = buildContractVariables(ctx)

      expect(vars.CONFERENCE_DATES).toContain('May')
      expect(vars.CONFERENCE_DATES).toContain('June')
    })

    it('should handle single-day conference', () => {
      const ctx = createBasicContext()
      delete ctx.conference.endDate

      const vars = buildContractVariables(ctx)

      expect(vars.CONFERENCE_DATES).toBe(vars.CONFERENCE_DATE)
    })

    it('should build conference location variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.CONFERENCE_CITY).toBe('Bergen')
      expect(vars.VENUE_NAME).toBe('Bergen Conference Center')
      expect(vars.VENUE_ADDRESS).toBe('Venue Road 10, Bergen')
    })

    it('should build organizer variables', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      expect(vars.ORG_NAME).toBe('Cloud Native Bergen')
      expect(vars.ORG_ORG_NUMBER).toBe('987\u00A0654\u00A0321')
      expect(vars.ORG_ADDRESS).toBe('Conference Street 1, Bergen, Norway')
      expect(vars.ORG_EMAIL).toBe('sponsors@cloudnativebergen.no')
    })

    it('should handle missing optional sponsor fields', () => {
      const ctx = createBasicContext()
      delete ctx.sponsor.orgNumber
      delete ctx.sponsor.address
      delete ctx.sponsor.website

      const vars = buildContractVariables(ctx)

      expect(vars.SPONSOR_NAME).toBe('Acme Corporation')
      expect(vars.SPONSOR_ORG_NUMBER).toBeUndefined()
      expect(vars.SPONSOR_ADDRESS).toBeUndefined()
      expect(vars.SPONSOR_WEBSITE).toBeUndefined()
    })

    it('should handle missing contact person', () => {
      const ctx = createBasicContext()
      delete ctx.contactPerson

      const vars = buildContractVariables(ctx)

      expect(vars.CONTACT_NAME).toBeUndefined()
      expect(vars.CONTACT_EMAIL).toBeUndefined()
    })

    it('should handle missing tier', () => {
      const ctx = createBasicContext()
      delete ctx.tier

      const vars = buildContractVariables(ctx)

      expect(vars.TIER_NAME).toBeUndefined()
      expect(vars.TIER_TAGLINE).toBeUndefined()
    })

    it('should handle empty addons list', () => {
      const ctx = createBasicContext()
      ctx.addons = []

      const vars = buildContractVariables(ctx)

      expect(vars.ADDONS_LIST).toBeUndefined()
    })

    it('should default to NOK when currency not specified', () => {
      const ctx = createBasicContext()
      delete ctx.contractCurrency

      const vars = buildContractVariables(ctx)

      expect(vars.CONTRACT_CURRENCY).toBe('NOK')
    })

    it('should handle missing contract value', () => {
      const ctx = createBasicContext()
      delete ctx.contractValue

      const vars = buildContractVariables(ctx)

      expect(vars.CONTRACT_VALUE).toBeUndefined()
      expect(vars.CONTRACT_VALUE_NUMBER).toBeUndefined()
      expect(vars.CONTRACT_CURRENCY).toBe('NOK')
    })

    it('should handle missing optional conference fields', () => {
      const ctx = createBasicContext()
      delete ctx.conference.city
      delete ctx.conference.organizerOrgNumber
      delete ctx.conference.organizerAddress
      delete ctx.conference.venueName
      delete ctx.conference.venueAddress
      delete ctx.conference.sponsorEmail

      const vars = buildContractVariables(ctx)

      expect(vars.CONFERENCE_TITLE).toBe('Cloud Native Days Norway 2026')
      expect(vars.CONFERENCE_CITY).toBeUndefined()
      expect(vars.ORG_ORG_NUMBER).toBeUndefined()
      expect(vars.ORG_ADDRESS).toBeUndefined()
      expect(vars.VENUE_NAME).toBeUndefined()
      expect(vars.VENUE_ADDRESS).toBeUndefined()
      expect(vars.ORG_EMAIL).toBeUndefined()
    })

    it('should format today date in correct format', () => {
      const ctx = createBasicContext()
      const vars = buildContractVariables(ctx)

      // Should be in format "11 February 2026"
      const dateRegex = /^\d{1,2} [A-Z][a-z]+ \d{4}$/
      expect(vars.TODAY_DATE).toMatch(dateRegex)
    })
  })

  describe('CONTRACT_VARIABLE_DESCRIPTIONS', () => {
    it('should have descriptions for all common variables', () => {
      const expectedVars = [
        'SPONSOR_NAME',
        'SPONSOR_ORG_NUMBER',
        'SPONSOR_ADDRESS',
        'CONTACT_NAME',
        'TIER_NAME',
        'CONTRACT_VALUE',
        'CONFERENCE_TITLE',
        'CONFERENCE_DATE',
        'ORG_NAME',
        'ORG_ORG_NUMBER',
        'ORG_ADDRESS',
        'VENUE_NAME',
      ]

      expectedVars.forEach((varName) => {
        expect(CONTRACT_VARIABLE_DESCRIPTIONS[varName]).toBeDefined()
        expect(CONTRACT_VARIABLE_DESCRIPTIONS[varName].length).toBeGreaterThan(
          0,
        )
      })
    })
  })
})
