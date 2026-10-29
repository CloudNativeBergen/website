/**
 * @vitest-environment jsdom
 *
 * Single delete lives in the side panel: the footer action asks for
 * confirmation with the cleanup choices, deletes, and closes the panel.
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'
import { SponsorRecordPanel } from '@/components/admin/sponsor-crm/SponsorRecordPanel'

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
  error: null as Error | null,
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotificationSafe: () => ({ showNotification: h.notify }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          list: { invalidate: h.invalidate },
          healthViolations: { invalidate: h.invalidate },
        },
      },
    }),
    sponsor: {
      crm: {
        getById: {
          useQuery: () => ({
            data: {
              _id: 'sfc-1',
              sponsor: { name: 'Acme' },
              signatureStatus: 'pending',
              signatureId: 'sig-1',
              contractDocument: { asset: { _ref: 'file-1' } },
            },
          }),
        },
        delete: {
          useMutation: (opts: {
            onSuccess: () => void
            onError: (e: Error) => void
          }) => ({
            mutate: (input: unknown) => {
              h.mutate(input)
              if (h.error) opts.onError(h.error)
              else opts.onSuccess()
            },
            isPending: false,
          }),
        },
      },
    },
  },
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  SponsorCRMForm: ({ onDelete }: { onDelete?: () => void }) => (
    <button onClick={onDelete}>Delete from footer</button>
  ),
}))
vi.mock('@/components/admin', () => ({ SponsorSendModal: () => null }))
vi.mock('@/components/admin/sponsor/SponsorSendModal', () => ({
  sponsorFromAddress: () => '',
}))

afterEach(() => {
  cleanup()
  h.mutate.mockClear()
  h.notify.mockClear()
  h.error = null
})

function renderPanel() {
  const onClose = vi.fn()
  render(
    <SponsorRecordPanel
      sponsorId="sfc-1"
      view="pipeline"
      onViewChange={vi.fn()}
      onClose={onClose}
      onChanged={vi.fn()}
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
    />,
  )
  fireEvent.click(screen.getByText('Delete from footer'))
  return { onClose, dialog: screen.getByRole('dialog') }
}

const confirm = (dialog: HTMLElement) =>
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete sponsor' }),
  )

it('confirms, deletes, refreshes the board and closes the panel', () => {
  const { onClose, dialog } = renderPanel()
  expect(h.mutate).not.toHaveBeenCalled()
  confirm(dialog)
  // Defaults: cancel the pending agreement, keep the contract PDF.
  expect(h.mutate).toHaveBeenCalledWith({
    id: 'sfc-1',
    cancelAgreement: true,
    deleteContractAsset: false,
  })
  expect(h.invalidate).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('passes each cleanup choice the organizer makes', () => {
  const { dialog } = renderPanel()
  fireEvent.click(
    within(dialog).getByRole('checkbox', { name: /Cancel pending signing/ }),
  )
  fireEvent.click(
    within(dialog).getByRole('checkbox', { name: /Delete contract PDF/ }),
  )
  confirm(dialog)
  expect(h.mutate).toHaveBeenCalledWith({
    id: 'sfc-1',
    cancelAgreement: false,
    deleteContractAsset: true,
  })
})

it('shows the server error and keeps the panel open when the delete fails', () => {
  h.error = new Error(
    'Could not cancel the signing agreement; nothing was deleted.',
  )
  const { onClose, dialog } = renderPanel()
  confirm(dialog)
  expect(h.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'error',
      message: 'Could not cancel the signing agreement; nothing was deleted.',
    }),
  )
  expect(onClose).not.toHaveBeenCalled()
})
