import { describe, expect, it } from 'vitest'
import { earlyAccessTicketTypeOf } from './ticket'

const SPONSOR = 'Sponsor discount (workshop upgrade)'

describe('earlyAccessTicketTypeOf', () => {
  it('answers the configured type a workshop ticket carries, matched as the rule matches', () => {
    expect(
      earlyAccessTicketTypeOf(
        [{ category: 'sponsor DISCOUNT (workshop upgrade)' }],
        [SPONSOR],
      ),
    ).toBe(SPONSOR)
  })

  it('answers null with no match, no tickets, or nothing configured', () => {
    expect(
      earlyAccessTicketTypeOf([{ category: 'Student' }], [SPONSOR]),
    ).toBeNull()
    expect(earlyAccessTicketTypeOf([], [SPONSOR])).toBeNull()
    expect(
      earlyAccessTicketTypeOf([{ category: SPONSOR }], undefined),
    ).toBeNull()
    expect(earlyAccessTicketTypeOf([{ category: SPONSOR }], [''])).toBeNull()
  })
})
