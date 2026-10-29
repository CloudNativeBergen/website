/**
 * @vitest-environment jsdom
 *
 * `?view=<tab>` on the sponsor page scrolls to that section; it must not open
 * the record. "Open record", "Manage" and each "Edit" open the board's side
 * panel over the page, kept in `?edit=<tab>`. There is no centered modal.
 */
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'
import { SponsorDashboardClient } from './SponsorDashboardClient'

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  query: 'view=contract',
  deleted: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
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
        getById: {
          useQuery: () => ({
            data: { _id: 'sfc-1', sponsor: { name: 'Acme' } },
          }),
        },
        delete: {
          useMutation: (opts: { onSuccess: () => void }) => ({
            mutate: (input: unknown) => {
              nav.deleted(input)
              opts.onSuccess()
            },
            isPending: false,
          }),
        },
        activities: { list: { useQuery: () => ({ data: [] }) } },
      },
    },
  },
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  SponsorCRMForm: ({
    presentation,
    initialView,
    onDelete,
  }: {
    presentation?: string
    initialView?: string
    onDelete?: () => void
  }) => (
    <div data-testid="record" data-presentation={presentation}>
      {initialView}
      <button onClick={onDelete}>Delete from footer</button>
    </div>
  ),
}))
vi.mock('@/components/admin', () => ({
  SponsorSendModal: ({ kind }: { kind: string }) => (
    <div data-testid="send">{kind}</div>
  ),
}))
vi.mock('@/components/admin/sponsor/SponsorSendModal', () => ({
  sponsorFromAddress: () => '',
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorDetailHeader', () => ({
  SponsorDetailHeader: ({
    onOpenRecord,
    onSendEmail,
  }: {
    onOpenRecord: () => void
    onSendEmail?: () => void
  }) => (
    <>
      <button onClick={onOpenRecord}>Open record</button>
      <button onClick={onSendEmail}>Send Email</button>
    </>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget', () => ({
  SponsorOverviewWidget: ({ onEdit }: { onEdit: () => void }) => (
    <button onClick={onEdit}>Edit pipeline</button>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorPhaseWidget', () => ({
  SponsorPhaseWidget: ({
    onOpenRecord,
  }: {
    onOpenRecord: (view: string) => void
  }) => <button onClick={() => onOpenRecord('pipeline')}>Manage</button>,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorFollowUpWidget', () => ({
  SponsorFollowUpWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorContactsWidget', () => ({
  SponsorContactsWidget: ({ onEdit }: { onEdit: () => void }) => (
    <button onClick={onEdit}>Edit contacts</button>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorContractWidget', () => ({
  SponsorContractWidget: ({ onEdit }: { onEdit: () => void }) => (
    <button onClick={onEdit}>Edit contract</button>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorRenewalWidget', () => ({
  SponsorRenewalWidget: () => null,
}))
vi.mock(
  '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget',
  () => ({
    SponsorActivityFeedWidget: ({
      onNewActivity,
    }: {
      onNewActivity: () => void
    }) => <button onClick={onNewActivity}>New activity</button>,
  }),
)

afterEach(cleanup)

const renderPage = () =>
  render(
    <SponsorDashboardClient
      sponsorId="sfc-1"
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
      initialView="contract"
    />,
  )

it('scrolls to the section for ?view=contract instead of opening the record', () => {
  nav.query = 'view=contract'
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
  renderPage()
  expect(screen.queryByTestId('record')).not.toBeInTheDocument()
  expect(scrollIntoView).toHaveBeenCalledTimes(1)
  expect(scrollIntoView.mock.contexts[0]).toHaveProperty('id', 'contract')
})

it.each([
  ['Open record', 'pipeline'],
  ['Manage', 'pipeline'],
  ['Edit pipeline', 'pipeline'],
  ['Edit contacts', 'contacts'],
  ['Edit contract', 'contract'],
  ['New activity', 'history'],
])('"%s" opens the side panel on the %s tab', (label, tab) => {
  nav.query = 'view=contract'
  nav.push.mockClear()
  renderPage()
  fireEvent.click(screen.getByText(label))
  expect(nav.push).toHaveBeenCalledWith(`?view=contract&edit=${tab}`, {
    scroll: false,
  })
})

it('renders ?edit=<tab> as the side panel, not a centered modal', () => {
  nav.query = 'edit=contacts'
  renderPage()
  const record = screen.getByTestId('record')
  expect(record).toHaveAttribute('data-presentation', 'panel')
  expect(record).toHaveTextContent('contacts')
})

it('header "Send Email" opens the panel with its send modal', () => {
  nav.query = 'view=contract'
  nav.push.mockClear()
  const { rerender } = renderPage()
  expect(screen.queryByTestId('send')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Send Email'))
  expect(nav.push).toHaveBeenCalledWith('?view=contract&edit=communications', {
    scroll: false,
  })
  // The push lands: the panel mounts with the information send open.
  nav.query = 'edit=communications'
  rerender(
    <SponsorDashboardClient
      sponsorId="sfc-1"
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
      initialView="contract"
    />,
  )
  expect(screen.getByTestId('record')).toHaveTextContent('communications')
  expect(screen.getByTestId('send')).toHaveTextContent('information')
})

it('Back after "Send Email", then Edit, does not reopen the send modal', () => {
  nav.query = 'view=contract'
  const page = () => (
    <SponsorDashboardClient
      sponsorId="sfc-1"
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
      initialView="contract"
    />
  )
  const { rerender } = render(page())
  fireEvent.click(screen.getByText('Send Email'))
  nav.query = 'edit=communications'
  rerender(page())
  expect(screen.getByTestId('send')).toBeInTheDocument()
  // Browser Back: the URL drops ?edit= without the panel's onClose.
  nav.query = 'view=contract'
  rerender(page())
  expect(screen.queryByTestId('record')).not.toBeInTheDocument()
  nav.query = 'edit=contacts'
  rerender(page())
  expect(screen.getByTestId('record')).toHaveTextContent('contacts')
  expect(screen.queryByTestId('send')).not.toBeInTheDocument()
})

it('deleting from the panel goes back to the board', () => {
  nav.query = 'edit=pipeline'
  nav.push.mockClear()
  renderPage()
  fireEvent.click(screen.getByText('Delete from footer'))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Acme')
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Delete sponsor' }),
  )
  expect(nav.deleted).toHaveBeenCalledWith({
    id: 'sfc-1',
    cancelAgreement: false,
  })
  expect(nav.push).toHaveBeenCalledWith('/admin/sponsors/crm')
})
