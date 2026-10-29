/**
 * @vitest-environment jsdom
 *
 * The dashboard card names a travel-support status the same way the
 * /cfp/expense page does.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/impersonation', () => ({
  useImpersonateQueryString: () => '',
}))

import { CompactTravelSupport } from '@/components/cfp/CompactTravelSupport'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'

describe('CompactTravelSupport status label', () => {
  it.each([
    ['submitted', 'Submitted'],
    ['rejected', 'Rejected'],
  ])('shows %s as %s', (status, label) => {
    render(
      <CompactTravelSupport
        travelSupport={
          {
            _id: 'ts-1',
            status,
            expenses: [],
          } as unknown as TravelSupportWithExpenses
        }
      />,
    )
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.queryByText('Under Review')).toBeNull()
  })
})
