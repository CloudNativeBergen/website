/**
 * @vitest-environment jsdom
 */
import type React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const showNotification = vi.fn()
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification }),
  useNotificationSafe: () => ({ showNotification }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/environment/localhost', () => ({
  isLocalhostClient: () => true,
}))

// Render menus and dialogs inline so the delete flow is reachable.
vi.mock('@/components/ActionMenu', () => ({
  ActionMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ActionMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  ActionMenuDivider: () => null,
}))
vi.mock('@/components/admin/ConfirmationModal', () => ({
  ConfirmationModal: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean
    onConfirm: () => void
  }) =>
    isOpen ? (
      <div role="dialog">
        <button type="button" onClick={onConfirm}>
          Confirm delete
        </button>
      </div>
    ) : null,
}))

const queryData: Record<string, unknown> = {}

// Every mutation fails: mutateAsync runs the hook's onError, then rejects,
// matching react-query's behaviour.
vi.mock('@/lib/trpc/client', () => {
  const node = (path: string[]): unknown =>
    new Proxy(() => {}, {
      get: (_t, key: string) => {
        if (key === 'useQuery')
          return (_input: unknown, opts?: { initialData?: unknown }) => ({
            data: queryData[path.join('.')] ?? opts?.initialData,
            isLoading: false,
            refetch: vi.fn(),
          })
        if (key === 'useMutation')
          return (opts?: { onError?: (e: Error) => void }) => ({
            isPending: false,
            mutateAsync: async () => {
              const err = new Error('boom')
              opts?.onError?.(err)
              throw err
            },
          })
        if (key === 'useUtils') return () => node([])
        if (key === 'invalidate' || key === 'fetch' || key === 'setData')
          return vi.fn()
        return node([...path, key])
      },
    })
  return { api: node([]) }
})

import { ProposalReviewForm } from '@/components/admin/ProposalReviewForm'
import { FeaturedSpeakersManager } from '@/components/admin/FeaturedSpeakersManager'
import { FeaturedTalksManager } from '@/components/admin/FeaturedTalksManager'
import { BadgeManagementClient } from '@/components/admin/BadgeManagementClient'

const expectError = () =>
  waitFor(() =>
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'boom' }),
    ),
  )

beforeEach(() => showNotification.mockClear())
afterEach(cleanup)

describe('admin mutation failures show a notification', () => {
  it('ProposalReviewForm: failed review submit', async () => {
    const { container } = render(
      <ProposalReviewForm proposalId="p1" onReviewSubmit={vi.fn()} />,
    )
    fireEvent.submit(container.querySelector('form')!)
    await expectError()
  })

  it('FeaturedSpeakersManager: failed remove', async () => {
    queryData['featured.admin.listSpeakers'] = [
      { _id: 's1', name: 'Anna', talks: [] },
    ]
    render(<FeaturedSpeakersManager />)
    fireEvent.click(screen.getByTitle('Remove from featured'))
    await expectError()
  })

  it('FeaturedTalksManager: failed remove', async () => {
    queryData['featured.admin.listTalks'] = [
      { _id: 't1', title: 'Talk', status: 'confirmed', speakers: [] },
    ]
    render(<FeaturedTalksManager />)
    fireEvent.click(screen.getByTitle('Remove from featured'))
    await expectError()
  })

  it('BadgeManagementClient: failed delete keeps the dialog open', async () => {
    render(
      <BadgeManagementClient
        conferenceTitle="Conf"
        conferenceStartDate="2026-10-01"
        initialSpeakers={[{ _id: 's1', name: 'Anna' } as never]}
        initialBadges={[
          {
            _id: 'b1',
            badgeId: 'b1',
            badgeType: 'speaker',
            issuedAt: '2026-01-01',
            speaker: { _id: 's1', name: 'Anna' },
          } as never,
        ]}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await expectError()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
