import { describe, it, expect } from 'vitest'
import { buildContactsCsv, contactsCsvFilename } from './contacts-csv'
import {
  mockSponsor,
  mockBillingInfo,
  mockContactPerson,
} from '@/__mocks__/sponsor-data'

const lines = (csv: string) => csv.trimEnd().split('\n')

describe('buildContactsCsv', () => {
  it('writes one line per contact person with the billing details repeated', () => {
    const csv = buildContactsCsv([
      mockSponsor({
        contactPersons: [
          mockContactPerson({ name: 'Jane Smith', isPrimary: true }),
          mockContactPerson({
            name: 'John Doe',
            email: 'john@example.com',
            phone: undefined,
            role: 'Finance',
          }),
        ],
      }),
    ])

    const rows = lines(csv)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('Jane Smith')
    expect(rows[1]).toContain('Yes')
    expect(rows[2]).toContain('John Doe')
    expect(rows[2]).toContain('No')
    // Billing repeats so a filtered spreadsheet never loses it.
    expect(rows[1]).toContain('billing@example.com')
    expect(rows[2]).toContain('billing@example.com')
  })

  it('still exports a sponsor with no contacts', () => {
    const csv = buildContactsCsv([mockSponsor({ contactPersons: [] })])

    const rows = lines(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toContain('Acme Corporation')
  })

  it('reports the billing gaps instead of an empty cell', () => {
    const csv = buildContactsCsv([
      mockSponsor({
        billing: undefined,
        contactPersons: [mockContactPerson()],
      }),
    ])

    expect(lines(csv)[1]).toContain('Missing: Billing details')
    expect(lines(csv)[1]).toContain('Not set')
  })

  it('quotes separators and escapes embedded quotes', () => {
    const csv = buildContactsCsv([
      mockSponsor({
        billing: mockBillingInfo({ comments: 'Split invoice, 50/50' }),
        sponsor: { ...mockSponsor().sponsor, name: 'Acme "Cloud" AS' },
      }),
    ])

    expect(lines(csv)[1]).toContain('"Acme ""Cloud"" AS"')
    expect(lines(csv)[1]).toContain('"Split invoice, 50/50"')
  })

  it('neutralises spreadsheet formula injection from sponsor-entered text', () => {
    const csv = buildContactsCsv([
      mockSponsor({
        billing: mockBillingInfo({ reference: '=HYPERLINK("http://evil")' }),
      }),
    ])

    expect(lines(csv)[1]).toContain("'=HYPERLINK")
  })

  it('starts with a UTF-8 BOM so Excel reads Norwegian characters', () => {
    expect(buildContactsCsv([])).toMatch(/^﻿/)
  })
})

describe('contactsCsvFilename', () => {
  it('slugifies the conference title', () => {
    expect(contactsCsvFilename('Cloud Native Days Norway 2026')).toBe(
      'sponsor-contacts-cloud-native-days-norway-2026.csv',
    )
  })

  it('falls back to a bare name when the title has no usable characters', () => {
    expect(contactsCsvFilename('—')).toBe('sponsor-contacts.csv')
  })
})
