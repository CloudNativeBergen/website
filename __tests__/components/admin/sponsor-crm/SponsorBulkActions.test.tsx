/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

type MutationOptions = {
  onSuccess?: (result: unknown) => void
  onError?: (error: { message: string }) => void
}

const bulkUpdateOptions: MutationOptions[] = []
const mockBulkUpdate = vi.fn()
// A rejecting mutateAsync: if the component ever reaches for it without
// catching, the rejection escapes as an unhandledrejection event.
const mockBulkUpdateAsync = vi.fn(() => Promise.reject(new Error('boom')))
const mockShowNotification = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          list: { invalidate: vi.fn() },
          healthViolations: { invalidate: vi.fn() },
        },
      },
    }),
    sponsor: {
      crm: {
        bulkUpdate: {
          useMutation: (options: MutationOptions) => {
            bulkUpdateOptions.push(options)
            return {
              mutate: mockBulkUpdate,
              mutateAsync: mockBulkUpdateAsync,
            }
          },
        },
        bulkDelete: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn(),
            isPending: false,
          }),
        },
        listOrganizers: { useQuery: () => ({ data: [] }) },
      },
    },
  },
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}))

vi.mock('@/components/admin/sponsor-crm/SponsorDeleteModal', () => ({
  __esModule: true,
  SponsorDeleteModal: () => null,
}))

import { SponsorBulkActions } from '@/components/admin/sponsor-crm/SponsorBulkActions'

const sponsors = [
  { _id: 'spc-1' },
  { _id: 'spc-2' },
] as unknown as SponsorForConferenceExpanded[]

const renderBulkActions = () =>
  render(
    <SponsorBulkActions
      selectedIds={['spc-1', 'spc-2']}
      sponsors={sponsors}
      onClearSelection={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )

describe('SponsorBulkActions — backend failures are surfaced', () => {
  beforeEach(() => {
    bulkUpdateOptions.length = 0
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('registers exactly one onError on the bulk update mutation', () => {
    renderBulkActions()
    expect(bulkUpdateOptions).toHaveLength(1)
    expect(typeof bulkUpdateOptions[0].onError).toBe('function')
  })

  /**
   * Regression: a rejected bulk update used to disappear — the caller neither
   * awaited nor reported it, so the toolbar just sat there. The server's own
   * message must reach the user the same way a success does.
   */
  it('shows the server message when the bulk update is rejected', () => {
    renderBulkActions()
    act(() => {
      bulkUpdateOptions[0].onError?.({
        message: 'Set a sponsor tier before marking as Won.',
      })
    })

    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Bulk update failed',
        message: 'Set a sponsor tier before marking as Won.',
      }),
    )
  })

  /**
   * `mutate`, not `mutateAsync`: nothing awaits these click handlers, so a
   * rejecting promise would become an unhandled rejection instead of a toast.
   */
  it('fires the mutation without leaving an unhandled rejection', async () => {
    const rejections: unknown[] = []
    const onRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault()
      rejections.push(e.reason)
    }
    window.addEventListener('unhandledrejection', onRejection)

    renderBulkActions()
    fireEvent.click(screen.getByText('Status'))
    fireEvent.click(await screen.findByText('Prospect'))

    await new Promise((r) => setTimeout(r, 0))
    window.removeEventListener('unhandledrejection', onRejection)

    expect(mockBulkUpdate).toHaveBeenCalledWith({
      ids: ['spc-1', 'spc-2'],
      status: 'prospect',
    })
    expect(mockBulkUpdateAsync).not.toHaveBeenCalled()
    expect(rejections).toEqual([])
  })
})
