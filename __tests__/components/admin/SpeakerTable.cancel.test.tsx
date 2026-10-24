/**
 * @vitest-environment jsdom
 *
 * The speaker row's action menu offers "Cancel talk" only for the speaker's
 * accepted or confirmed talks at the current conference, and picking one opens
 * the cancel modal for that talk.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

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

// The modal itself is covered elsewhere; record what it is opened with.
vi.mock('@/components/admin/ProposalActionModal', () => ({
  ProposalActionModal: (props: {
    action: string
    adminUI?: boolean
    proposal: { title: string; speakers: { name: string }[] }
  }) => (
    <div data-testid="proposal-action-modal">
      {props.action}|{String(props.adminUI)}|{props.proposal.title}|
      {props.proposal.speakers[0]?.name}
    </div>
  ),
}))

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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
    proposals: [
      {
        _id: 'p-current',
        title: 'Current Talk',
        status: 'confirmed',
        conference: { _id: 'conf-2026' },
      },
      {
        _id: 'p-other',
        title: 'Other Conference Talk',
        status: 'confirmed',
        conference: { _id: 'conf-2025' },
      },
      {
        _id: 'p-rejected',
        title: 'Rejected Talk',
        status: 'rejected',
        conference: { _id: 'conf-2026' },
      },
    ],
  },
] as unknown as (Speaker & { proposals: ProposalExisting[] })[]

describe('SpeakerTable cancel talk action', () => {
  it('offers cancel only for the confirmed talk at the current conference and opens the modal', () => {
    render(
      <SpeakerTable
        speakers={speakers}
        currentConferenceId="conf-2026"
        onEditSpeaker={vi.fn()}
        onPreviewSpeaker={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Actions for Ada Lovelace' })[0],
    )

    const items = screen.getAllByText(/^Cancel talk:/)
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toBe('Cancel talk: Current Talk')
    expect(screen.queryByTestId('proposal-action-modal')).toBeNull()

    fireEvent.click(items[0])

    expect(screen.getByTestId('proposal-action-modal').textContent).toBe(
      'cancel|true|Current Talk|Ada Lovelace',
    )
  })
})
