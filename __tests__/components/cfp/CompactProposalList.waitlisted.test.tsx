/**
 * @vitest-environment jsdom
 *
 * A waitlisted speaker can withdraw (the state machine allows it), and the
 * status badge uses the shared colour ladder.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProposalExisting } from '@/lib/proposal/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/impersonation', () => ({ useImpersonateQueryString: () => '' }))
vi.mock('@/components/admin', () => ({ ProposalActionModal: () => null }))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

import { CompactProposalList } from '@/components/cfp/CompactProposalList'

const proposal = (status: string) =>
  ({
    _id: `p-${status}`,
    title: `Talk ${status}`,
    status,
    format: 'presentation_25',
    speakers: [],
  }) as unknown as ProposalExisting

describe('CompactProposalList', () => {
  it('offers withdrawal on a waitlisted proposal', () => {
    render(<CompactProposalList proposals={[proposal('waitlisted')]} canEdit />)
    expect(screen.getByRole('button', { name: /can.t make it/i })).toBeTruthy()
  })

  it('colours a submitted proposal like admin does', () => {
    render(<CompactProposalList proposals={[proposal('submitted')]} canEdit />)
    expect(screen.getByText('Submitted').className).toContain('bg-blue-100')
  })
})
