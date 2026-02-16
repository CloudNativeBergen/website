// Mock next/cache before importing the module under test
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import {
  buildPricingMatrix,
  getTicketSaleStatus,
  formatTicketPrice,
  extractComplimentaryTickets,
  stripHtml,
  type PublicTicketType,
} from '@/lib/tickets/public'

function createTicket(overrides: Partial<PublicTicketType>): PublicTicketType {
  return {
    id: 1,
    name: 'Test Ticket',
    type: 'ticket',
    description: null,
    price: [{ price: '100', vat: '25', description: null, key: null }],
    available: null,
    requiresInvitation: false,
    visibleStartsAt: null,
    visibleEndsAt: null,
    position: 0,
    ...overrides,
  }
}

describe('buildPricingMatrix', () => {
  it('should parse tiered tickets into a grid', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Early Bird: Conference Only (1 day)',
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Early Bird: Workshop + Conference (2 days)',
        position: 1,
      }),
      createTicket({
        id: 3,
        name: 'Standard: Conference Only (1 day)',
        position: 2,
      }),
      createTicket({
        id: 4,
        name: 'Standard: Workshop + Conference (2 days)',
        position: 3,
      }),
    ]

    const { categories, tiers, matrix } = buildPricingMatrix(tickets)

    expect(tiers).toHaveLength(2)
    expect(tiers[0].label).toBe('Early Bird')
    expect(tiers[1].label).toBe('Standard')

    expect(categories).toHaveLength(2)
    expect(categories[0].label).toBe('Conference Only (1 day)')
    expect(categories[1].label).toBe('Workshop + Conference (2 days)')

    expect(matrix).toHaveLength(2)
    expect(matrix[0][0]?.id).toBe(1) // Early Bird × Conference Only
    expect(matrix[0][1]?.id).toBe(3) // Standard × Conference Only
    expect(matrix[1][0]?.id).toBe(2) // Early Bird × Workshop
    expect(matrix[1][1]?.id).toBe(4) // Standard × Workshop
  })

  it('should handle three tiers', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Early Bird: Conf', position: 0 }),
      createTicket({ id: 2, name: 'Standard: Conf', position: 1 }),
      createTicket({ id: 3, name: 'Late Bird: Conf', position: 2 }),
    ]

    const { tiers, matrix } = buildPricingMatrix(tickets)

    expect(tiers).toHaveLength(3)
    expect(tiers.map((t) => t.label)).toEqual([
      'Early Bird',
      'Standard',
      'Late Bird',
    ])
    expect(matrix[0]).toHaveLength(3)
  })

  it('should treat tickets without colons as standalone', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Early Bird: Conf', position: 0 }),
      createTicket({ id: 2, name: 'Standard: Conf', position: 1 }),
      createTicket({ id: 3, name: 'Student Ticket', position: 2 }),
    ]

    const { categories, tiers, matrix } = buildPricingMatrix(tickets)

    expect(tiers).toHaveLength(2)
    expect(categories).toHaveLength(2)
    expect(categories[0].label).toBe('Conf')
    expect(categories[1].label).toBe('Student Ticket')

    // Student row should be all nulls in the matrix (standalone)
    expect(matrix[1].every((cell) => cell === null)).toBe(true)
  })

  it('should handle standalone tickets with unique category', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Early Bird: Conf', position: 0 }),
      createTicket({ id: 2, name: 'Standard: Conf', position: 1 }),
      createTicket({
        id: 3,
        name: 'Student: The 1337 Ticket',
        position: 2,
      }),
    ]

    const { categories, tiers } = buildPricingMatrix(tickets)

    // Student has a colon but "The 1337 Ticket" is unique to one tier
    expect(tiers).toHaveLength(2)
    expect(tiers.map((t) => t.label)).toEqual(['Early Bird', 'Standard'])

    // Student falls through as standalone
    const standaloneCategories = categories.filter((_, idx) => {
      const { matrix } = buildPricingMatrix(tickets)
      return matrix[idx].every((cell) => cell === null)
    })
    expect(standaloneCategories).toHaveLength(1)
    expect(standaloneCategories[0].label).toBe('Student: The 1337 Ticket')
  })

  it('should handle an empty array', () => {
    const { categories, tiers, matrix } = buildPricingMatrix([])

    expect(categories).toHaveLength(0)
    expect(tiers).toHaveLength(0)
    expect(matrix).toHaveLength(0)
  })

  it('should handle all standalone tickets (no valid tiers)', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Ticket A', position: 0 }),
      createTicket({ id: 2, name: 'Ticket B', position: 1 }),
    ]

    const { categories, tiers, matrix } = buildPricingMatrix(tickets)

    expect(tiers).toHaveLength(0)
    expect(categories).toHaveLength(2)
    // All rows should be empty (no tier columns)
    matrix.forEach((row) => expect(row).toHaveLength(0))
  })

  it('should handle sparse matrix (missing tier/category combos)', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Early Bird: Conf', position: 0 }),
      createTicket({ id: 2, name: 'Standard: Conf', position: 1 }),
      createTicket({ id: 3, name: 'Standard: Workshop', position: 2 }),
      createTicket({ id: 4, name: 'Early Bird: Workshop', position: 3 }),
    ]

    const { matrix } = buildPricingMatrix(tickets)

    // 2 categories × 2 tiers, all filled
    expect(matrix).toHaveLength(2)
    expect(matrix[0]).toHaveLength(2)
    expect(matrix[1]).toHaveLength(2)
    // All cells should be filled
    matrix.forEach((row) => row.forEach((cell) => expect(cell).not.toBeNull()))
  })

  it('should preserve array ordering for tiers and categories', () => {
    const tickets = [
      createTicket({ id: 1, name: 'Standard: B', position: 2 }),
      createTicket({ id: 2, name: 'Early Bird: A', position: 0 }),
      createTicket({ id: 3, name: 'Standard: A', position: 1 }),
      createTicket({ id: 4, name: 'Early Bird: B', position: 3 }),
    ]

    const { tiers, categories } = buildPricingMatrix(tickets)

    // Tiers ordered by first appearance in array order
    // Array: Std:B, EB:A, Std:A, EB:B → Standard first, then Early Bird
    expect(tiers[0].label).toBe('Standard')
    expect(tiers[1].label).toBe('Early Bird')

    // Categories ordered by first appearance: B at index 0, A at index 1
    expect(categories[0].label).toBe('B')
    expect(categories[1].label).toBe('A')
  })

  it('should include date range on tiers from visibility windows', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Early Bird: Conf',
        position: 0,
        visibleStartsAt: '2026-01-01T00:00:00Z',
        visibleEndsAt: '2026-06-01T00:00:00Z',
      }),
      createTicket({
        id: 2,
        name: 'Standard: Conf',
        position: 1,
        visibleStartsAt: '2026-06-01T00:00:00Z',
        visibleEndsAt: '2026-10-01T00:00:00Z',
      }),
    ]

    const { tiers } = buildPricingMatrix(tickets)

    expect(tiers[0].dateRange).toContain('Jan')
    expect(tiers[0].dateRange).toContain('Jun')
    expect(tiers[1].dateRange).toContain('Jun')
    expect(tiers[1].dateRange).toContain('Oct')
  })

  it('should handle colon in category name (split on first colon only)', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Early Bird: Workshop: Advanced K8s',
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Standard: Workshop: Advanced K8s',
        position: 1,
      }),
    ]

    const { tiers, categories } = buildPricingMatrix(tickets)

    expect(tiers).toHaveLength(2)
    expect(categories[0].label).toBe('Workshop: Advanced K8s')
  })
})

describe('getTicketSaleStatus', () => {
  it('should return active for tickets with no visibility window', () => {
    const ticket = createTicket({
      visibleStartsAt: null,
      visibleEndsAt: null,
    })
    expect(getTicketSaleStatus(ticket)).toBe('active')
  })

  it('should return expired for tickets past their end date', () => {
    const ticket = createTicket({
      visibleEndsAt: '2020-01-01T00:00:00Z',
    })
    expect(getTicketSaleStatus(ticket)).toBe('expired')
  })

  it('should return upcoming for tickets before their start date', () => {
    const ticket = createTicket({
      visibleStartsAt: '2099-01-01T00:00:00Z',
    })
    expect(getTicketSaleStatus(ticket)).toBe('upcoming')
  })

  it('should return active for tickets within their visibility window', () => {
    const ticket = createTicket({
      visibleStartsAt: '2020-01-01T00:00:00Z',
      visibleEndsAt: '2099-12-31T00:00:00Z',
    })
    expect(getTicketSaleStatus(ticket)).toBe('active')
  })

  it('should prioritize expired over upcoming (end date checked first)', () => {
    const ticket = createTicket({
      visibleStartsAt: '2099-01-01T00:00:00Z',
      visibleEndsAt: '2020-01-01T00:00:00Z',
    })
    expect(getTicketSaleStatus(ticket)).toBe('expired')
  })
})

describe('formatTicketPrice', () => {
  // nb-NO locale uses non-breaking space (U+00A0) as group separator
  const nbsp = '\u00A0'

  it('should format price excluding VAT by default', () => {
    expect(formatTicketPrice('2000', '25')).toBe(`2${nbsp}000`)
  })

  it('should format price including VAT when requested', () => {
    expect(formatTicketPrice('2000', '25', { includeVat: true })).toBe(
      `2${nbsp}500`,
    )
  })

  it('should handle zero price', () => {
    expect(formatTicketPrice('0', '25')).toBe('0')
  })

  it('should handle decimal prices', () => {
    expect(formatTicketPrice('99.99', '25')).toBe('100')
  })

  it('should handle decimal prices with VAT', () => {
    expect(formatTicketPrice('100', '25', { includeVat: true })).toBe('125')
  })

  it('should handle zero VAT', () => {
    expect(formatTicketPrice('1000', '0', { includeVat: true })).toBe(
      `1${nbsp}000`,
    )
  })

  it('should handle large prices', () => {
    expect(formatTicketPrice('50000', '25')).toBe(`50${nbsp}000`)
  })
})

describe('extractComplimentaryTickets', () => {
  it('should extract invite-only tickets with descriptions', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Speaker Ticket',
        requiresInvitation: true,
        description: 'Complimentary ticket for speakers',
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Regular Ticket',
        requiresInvitation: false,
        position: 1,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Speaker Ticket')
    expect(result[0].description).toBe('Complimentary ticket for speakers')
    expect(result[0].link).toBe('/cfp')
  })

  it('should extract zero-price tickets with descriptions', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Volunteer Ticket',
        requiresInvitation: false,
        price: [{ price: '0', vat: '25', description: null, key: null }],
        description: 'Free ticket for volunteers',
        position: 0,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Volunteer Ticket')
    expect(result[0].description).toBe('Free ticket for volunteers')
    expect(result[0].link).toBe('/volunteer')
  })

  it('should extract tickets with empty price array if name matches', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Volunteer',
        price: [],
        description: 'Free volunteer ticket',
        position: 0,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Volunteer')
  })

  it('should skip tickets without descriptions', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Speaker Ticket',
        requiresInvitation: true,
        description: null,
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Volunteer Ticket',
        requiresInvitation: true,
        description: '',
        position: 1,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(0)
  })

  it('should exclude non-speaker/volunteer hidden tickets', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Crew Ticket',
        requiresInvitation: true,
        description: 'Internal crew access',
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Staff Ticket',
        requiresInvitation: true,
        description: 'Internal staff ticket',
        position: 1,
      }),
      createTicket({
        id: 3,
        name: 'Organizer Pass',
        requiresInvitation: true,
        description: 'Organizer access',
        position: 2,
      }),
      createTicket({
        id: 4,
        name: 'Speaker Ticket',
        requiresInvitation: true,
        description: 'Speaker comp',
        position: 3,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Speaker Ticket')
  })

  it('should not extract paid public tickets', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Regular Ticket',
        requiresInvitation: false,
        price: [{ price: '2000', vat: '25', description: null, key: null }],
        description: 'Standard conference ticket',
        position: 0,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(0)
  })

  it('should sort by position', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Volunteer',
        requiresInvitation: true,
        description: 'Vol desc',
        position: 5,
      }),
      createTicket({
        id: 2,
        name: 'Speaker',
        requiresInvitation: true,
        description: 'Speaker desc',
        position: 1,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Speaker')
    expect(result[0].link).toBe('/cfp')
    expect(result[1].name).toBe('Volunteer')
    expect(result[1].link).toBe('/volunteer')
  })

  it('should strip HTML from descriptions', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Speaker Ticket',
        requiresInvitation: true,
        description:
          '<p>Free ticket for <strong>accepted</strong> speakers</p>',
        position: 0,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result[0].description).toBe('Free ticket for accepted speakers')
  })

  it('should handle a mix of complimentary and paid tickets', () => {
    const tickets = [
      createTicket({
        id: 1,
        name: 'Early Bird: Conf',
        price: [{ price: '2000', vat: '25', description: null, key: null }],
        description: 'Conference ticket',
        position: 0,
      }),
      createTicket({
        id: 2,
        name: 'Speaker Ticket',
        requiresInvitation: true,
        description: 'Speaker comp',
        position: 1,
      }),
      createTicket({
        id: 3,
        name: 'Volunteer Ticket',
        requiresInvitation: true,
        description: 'Volunteer comp',
        position: 2,
      }),
      createTicket({
        id: 4,
        name: 'Standard: Conf',
        price: [{ price: '3000', vat: '25', description: null, key: null }],
        description: 'Conference ticket',
        position: 3,
      }),
    ]

    const result = extractComplimentaryTickets(tickets)

    expect(result).toHaveLength(2)
    expect(result.map((t) => t.name)).toEqual([
      'Speaker Ticket',
      'Volunteer Ticket',
    ])
    expect(result[0].link).toBe('/cfp')
    expect(result[1].link).toBe('/volunteer')
  })

  it('should return empty array when no tickets provided', () => {
    expect(extractComplimentaryTickets([])).toEqual([])
  })
})

describe('stripHtml', () => {
  it('should strip HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('should handle text without HTML', () => {
    expect(stripHtml('Plain text')).toBe('Plain text')
  })

  it('should trim whitespace', () => {
    expect(stripHtml('  <p>  text  </p>  ')).toBe('text')
  })

  it('should handle empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('should handle self-closing tags', () => {
    expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1Line 2')
  })

  it('should handle nested tags', () => {
    expect(stripHtml('<div><p><em>nested</em></p></div>')).toBe('nested')
  })
})
