/**
 * @vitest-environment jsdom
 *
 * Row actions must be held for the duration of a bulk sweep.
 *
 * The sweep does not bypass delivery markers, but a row action does — and the
 * sweep reads its proposals ONCE at the start, so a marker written by a row
 * action mid-sweep is invisible to it. Clicking a row while a sweep runs
 * therefore sends the same speaker two provider invitations and two emails, and
 * the sweep's own count is short by one.
 *
 * `SpeakerTable` renders the desktop table AND the mobile card (hidden by CSS,
 * both present in the DOM), and `ticketActionsDisabled` was wired into the
 * mobile card only — so the desktop row, the one an organizer actually clicks,
 * stayed live through the whole sweep. This asserts on the count of ENABLED
 * buttons across both, which is what makes the desktop omission visible.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// The table's only tRPC use is the featured-speaker toggle, which this test
// never touches; stubbed so the component can render without a provider.
vi.mock('@/lib/trpc/client', () => ({
  api: {
    featured: {
      admin: {
        addSpeaker: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        removeSpeaker: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/speakers',
}))

import { render, screen, cleanup } from '@testing-library/react'
import { SpeakerTable } from '@/components/admin/SpeakerTable'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

afterEach(cleanup)

const speakers = [
  {
    _id: 'speaker-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    flags: [],
    links: [],
    proposals: [],
  },
] as unknown as (Speaker & { proposals: ProposalExisting[] })[]

const ticketStatuses = {
  'speaker-1': { speakerId: 'speaker-1', state: 'not-invited' as const },
}

function renderTable(props: Record<string, unknown> = {}) {
  render(
    <SpeakerTable
      speakers={speakers}
      ticketStatuses={ticketStatuses}
      onEditSpeaker={vi.fn()}
      onPreviewSpeaker={vi.fn()}
      onSendTicketInvitation={vi.fn()}
      {...props}
    />,
  )
  return screen.getAllByRole('button', { name: /send invitation|sending/i })
}

describe('SpeakerTable ticket row actions', () => {
  it('offers the action in both the desktop row and the mobile card', () => {
    const buttons = renderTable()

    // One per layout — proves the assertion below sees the desktop cell too.
    expect(buttons).toHaveLength(2)
    expect(buttons.every((b) => !b.hasAttribute('disabled'))).toBe(true)
  })

  it('holds EVERY row action, desktop included, while a sweep runs', () => {
    const buttons = renderTable({ ticketActionsDisabled: true })

    expect(buttons).toHaveLength(2)
    expect(buttons.filter((b) => !b.hasAttribute('disabled'))).toHaveLength(0)
  })

  it('holds only the speaker whose own invitation is in flight', () => {
    const buttons = renderTable({
      sendingTicketSpeakerIds: new Set(['someone-else']),
    })

    expect(buttons.every((b) => !b.hasAttribute('disabled'))).toBe(true)
  })
})
