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
vi.mock('@/components/admin/ProposalManagementModal', () => ({
  ProposalManagementModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="edit-modal" /> : null,
}))
vi.mock('@/components/SpeakerProfilePreview', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-modal" /> : null,
}))
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => '/admin/proposals/prop-1',
  useSearchParams: () => new URLSearchParams('tab=reviews'),
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

afterEach(() => {
  cleanup()
  push.mockClear()
})

describe('AdminActionBar keyboard shortcuts (C8)', () => {
  it('opens the edit modal on ⌘E when no modal is open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('e')
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument()
  })

  // ⌘M no longer opens a modal: it adds `?messageId=` to the CURRENT route,
  // which the layout-wide MessageSlideOver picks up. Other params must survive.
  it('opens the message slide-over on ⌘M by adding messageId to the URL', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)
    cmd('m')
    expect(push).toHaveBeenCalledWith(
      '/admin/proposals/prop-1?tab=reviews&messageId=conversation.proposal.prop-1',
      { scroll: false },
    )
  })

  it('suppresses global shortcuts while a modal is already open', () => {
    render(<AdminActionBar proposal={proposal} conference={conference} />)

    // Open the speaker preview via ⌘P.
    cmd('p')
    expect(screen.getByTestId('preview-modal')).toBeInTheDocument()

    // ⌘E must NOT stack a second focus-trapped modal on top.
    cmd('e')
    expect(screen.queryByTestId('edit-modal')).not.toBeInTheDocument()

    // ...and ⌘M must not navigate out from under it either.
    cmd('m')
    expect(push).not.toHaveBeenCalled()
  })
})
