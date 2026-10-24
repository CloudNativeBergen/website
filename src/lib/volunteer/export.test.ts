import { describe, expect, it } from 'vitest'
import { buildVolunteersCsv, volunteerLogistics } from './export'
import { Occupation, TShirtSize, VolunteerStatus } from './types'

const base = {
  _id: 'a',
  name: 'Ola, "Nordmann"',
  email: 'ola@example.com',
  phone: '+4712345678',
  status: VolunteerStatus.CONFIRMED,
  occupation: Occupation.STUDENT,
  tshirtSize: TShirtSize.M,
  dietaryRestrictions: 'Vegan\nno nuts',
  preferredTasks: ['registration', 'av'],
  assignedTasks: ['Info desk'],
  availability: 'Both days',
  confirmedAt: '2026-10-01T10:00:00Z',
}

describe('buildVolunteersCsv', () => {
  it('escapes and guards cells and maps ticket status', () => {
    const csv = buildVolunteersCsv(
      [base, { ...base, _id: 'b', name: '=HYPERLINK()' }],
      { a: { state: 'redeemed' } },
    )
    const lines = csv.replace(/^﻿/, '').trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'Name,Email,Phone,Status,Occupation,T-shirt size,Dietary restrictions,Preferred tasks,Assigned tasks,Availability,Ticket status,Confirmed at',
    )
    expect(lines[1]).toBe(
      `"Ola, ""Nordmann""",ola@example.com,'+4712345678,confirmed,student,M,Vegan no nuts,"registration; av",Info desk,Both days,Ticket claimed,2026-10-01T10:00:00Z`,
    )
    expect(lines[2].startsWith("'=HYPERLINK()")).toBe(true)
    expect(lines[2]).toContain(',,2026') // no ticket status known
  })
})

describe('volunteerLogistics', () => {
  it('counts approved and confirmed only', () => {
    const r = volunteerLogistics([
      base,
      { ...base, status: VolunteerStatus.APPROVED, tshirtSize: TShirtSize.M },
      { ...base, status: VolunteerStatus.PENDING, tshirtSize: TShirtSize.XL },
      {
        ...base,
        status: VolunteerStatus.APPROVED,
        tshirtSize: undefined,
        dietaryRestrictions: '  ',
      },
    ])
    expect(r.count).toBe(3)
    expect(Object.fromEntries(r.sizes)).toMatchObject({ M: 2, XL: 0 })
    expect(r.noSize).toBe(1)
    expect(r.dietary).toHaveLength(2)
  })
})
