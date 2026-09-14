/**
 * @vitest-environment jsdom
 *
 * ADMIN CO-SPEAKER REMOVAL MUST GO THROUGH proposal.removeCoSpeaker.
 *
 * The modal used to hand ProposalCoSpeaker only an onSpeakersChange
 * fallback, so removal just trimmed local speakers[] state (persisted
 * later by admin.update) and skipped the dedicated mutation that
 * atomically cancels the matching accepted coSpeakerInvitation —
 * leaving a stale "accepted" invitation row behind.
 *
 * This drives the real ProposalCoSpeaker + ConfirmationModal remove
 * flow inside the modal and asserts the mutation is called.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const removeCoSpeakerSpy = vi.fn().mockResolvedValue({})
const refreshSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: {
        list: {
          useQuery: () => ({ data: [], isLoading: false }),
        },
      },
    },
    proposal: {
      admin: {
        create: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        update: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
      removeCoSpeaker: {
        useMutation: () => ({ mutateAsync: removeCoSpeakerSpy }),
      },
      addCoSpeakerProfile: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      invitation: {
        send: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        cancel: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        remind: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        resend: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('./NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
// Headless-UI dialog plumbing replaced with a plain container; the modal
// content (including the ConfirmationModal's) renders inline when open.
const dirtyStates: boolean[] = []
vi.mock('@/components/ModalShell', () => ({
  ModalShell: ({
    isOpen,
    isDirty,
    children,
  }: {
    isOpen: boolean
    isDirty?: boolean
    children: React.ReactNode
  }) => {
    dirtyStates.push(!!isDirty)
    return isOpen ? <div>{children}</div> : null
  },
}))
vi.mock('@headlessui/react', () => ({
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}))
vi.mock('@/components/proposal/ProposalDetailsForm', () => ({
  ProposalDetailsForm: () => null,
}))
vi.mock('@/components/SpeakerAvatars', () => ({
  SpeakerAvatars: () => null,
}))

import { ProposalManagementModal } from './ProposalManagementModal'
import { Format, Language, Level } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

const proposal = {
  _id: 'prop-1',
  title: 'Talk',
  description: [],
  language: Language.english,
  format: Format.presentation_40,
  level: Level.beginner,
  audiences: [],
  topics: [],
  outline: '',
  speakers: [
    { _id: 'spk-primary', name: 'Primary Speaker' },
    { _id: 'spk-co', name: 'Co Speaker' },
  ],
  coSpeakerInvitations: [],
} as unknown as ProposalExisting

const conference = {
  _id: 'conf-1',
  formats: [Format.presentation_40],
  topics: [],
} as unknown as Conference

describe('ProposalManagementModal co-speaker removal', () => {
  it('calls proposal.removeCoSpeaker with the proposal and speaker id', async () => {
    render(
      <ProposalManagementModal
        isOpen={true}
        onClose={vi.fn()}
        editingProposal={proposal}
        conference={conference}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Co Speaker from this proposal',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(removeCoSpeakerSpy).toHaveBeenCalledWith({
        proposalId: 'prop-1',
        speakerId: 'spk-co',
      }),
    )

    // The modal's hosts render from server props, so the tRPC cache alone
    // leaves the page stale after a remove-then-cancel.
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())

    // The removal is ALREADY persisted, so the dirty-close guard must not arm
    // and warn about discarding it.
    await waitFor(() =>
      expect(screen.queryByText('Co Speaker')).not.toBeInTheDocument(),
    )
    expect(dirtyStates.at(-1)).toBe(false)
  })
})
