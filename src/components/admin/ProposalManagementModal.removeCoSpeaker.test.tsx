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

vi.mock('@/lib/trpc/client', () => ({
  api: {
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
      invitation: {
        send: { useMutation: () => ({ mutateAsync: vi.fn() }) },
        cancel: { useMutation: () => ({ mutateAsync: vi.fn() }) },
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
vi.mock('@/components/ModalShell', () => ({
  ModalShell: ({
    isOpen,
    children,
  }: {
    isOpen: boolean
    children: React.ReactNode
  }) => (isOpen ? <div>{children}</div> : null),
}))
vi.mock('@headlessui/react', () => ({
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}))
vi.mock('@/components/admin/SpeakerMultiSelect', () => ({
  SpeakerMultiSelect: () => null,
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
        name: 'Remove Co Speaker as co-speaker',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(removeCoSpeakerSpy).toHaveBeenCalledWith({
        proposalId: 'prop-1',
        speakerId: 'spk-co',
      }),
    )
  })
})
