/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ProposalContextPaneView } from '@/components/messaging/ProposalContextPane'
import { ProposalStatusBadge } from '@/lib/proposal/ui/badges'
import { Status, type ProposalExisting } from '@/lib/proposal/types'
import { VOLUNTEER_TICKET_LABELS } from '@/lib/volunteer/export'

afterEach(cleanup)

describe('ProposalContextPane status badge', () => {
  it.each(Object.values(Status))(
    'matches the canonical badge for %s',
    (status) => {
      const pane = render(
        <ProposalContextPaneView
          proposal={{ _id: 'p1', title: 'T', status } as ProposalExisting}
        />,
      )
      const canonical = render(<ProposalStatusBadge status={status} />)
      const badge = canonical.container.firstElementChild!
      const match = Array.from(pane.container.querySelectorAll('span')).find(
        (el) => el.className === badge.className,
      )
      expect(match?.textContent).toBe(badge.textContent)
    },
  )
})

describe('VOLUNTEER_TICKET_LABELS', () => {
  it('labels every volunteer ticket state', () => {
    expect(VOLUNTEER_TICKET_LABELS).toEqual({
      redeemed: 'Ticket claimed',
      invited: 'Approval email sent',
      'not-invited': 'No approval email',
      unknown: 'Unknown',
    })
  })
})
