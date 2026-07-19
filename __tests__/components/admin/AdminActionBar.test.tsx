/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AdminActionBar } from '@/components/admin/AdminActionBar'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

// Lightweight stand-ins so the shortcut behaviour can be tested without the
// modals' tRPC/query dependencies.
vi.mock('@/components/admin/SendMessageModal', () => ({
  SendMessageModal: () => <div data-testid="message-modal" />,
}))
vi.mock('@/components/admin/ProposalManagementModal', () => ({
  ProposalManagementModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="edit-modal" /> : null,
}))
vi.mock('@/components/SpeakerProfilePreview', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-modal" /> : null,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

const proposal = {
  _id: 'prop-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Scaling Kubernetes',
  description: [],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.submitted,
  outline: '',
  topics: [],
  tos: true,
  speakers: [
    {
      _id: 'spk-1',
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Jane Doe',
      email: 'jane@example.com',
      slug: 'jane-doe',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
} as unknown as ProposalExisting

const conference = { _id: 'conf-1' } as unknown as Conference

const cmd = (key: string) => fireEvent.keyDown(window, { key, metaKey: true })

afterEach(() => cleanup())

describe('AdminActionBar keyboard shortcuts (C8)', () => {
  it('opens the edit modal on ⌘E when no modal is open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('e')
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
  })

  it('suppresses global shortcuts while a modal is already open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    // Open the message modal via ⌘M.
    cmd('m')
    expect(screen.getByTestId('message-modal')).toBeInTheDocument()

    // ⌘E must NOT stack a second focus-trapped modal on top.
    cmd('e')
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()
  })
})
