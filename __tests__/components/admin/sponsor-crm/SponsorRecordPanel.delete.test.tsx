/**
 * @vitest-environment jsdom
 *
 * Single delete lives in the side panel: the footer action asks for
 * confirmation naming the sponsor, deletes, and closes the panel.
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

const h = vi.hoisted(() => ({ mutate: vi.fn(), invalidate: vi.fn() }))

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
            },
          }),
        },
        delete: {
          useMutation: (opts: { onSuccess: () => void }) => ({
            mutate: (input: unknown) => {
              h.mutate(input)
              opts.onSuccess()
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

afterEach(cleanup)

it('confirms, deletes, refreshes the board and closes the panel', () => {
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
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Delete Acme')
  expect(h.mutate).not.toHaveBeenCalled()

  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete sponsor' }),
  )

  expect(h.mutate).toHaveBeenCalledWith({ id: 'sfc-1', cancelAgreement: true })
  expect(h.invalidate).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})
