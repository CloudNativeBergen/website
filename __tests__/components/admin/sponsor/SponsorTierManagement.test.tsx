/**
 * @vitest-environment jsdom
 *
 * The tiers page creates and edits sponsors the board's way (#1704, E3):
 * "Add Sponsor" opens the create form with the tier preselected, a new
 * sponsor continues in the shared record panel, and "Edit sponsor" opens
 * that panel (`?sponsor=<id>&view=<tab>`).
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'
import type {
  ConferenceSponsor,
  SponsorTierExisting,
} from '@/lib/sponsor/types'

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  query: '',
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: nav.push,
    back: vi.fn(),
    refresh: nav.refresh,
  }),
  useSearchParams: () => new URLSearchParams(nav.query),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({}),
    sponsor: {
      crm: {
        delete: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
        },
      },
    },
  },
}))
vi.mock('@/components/admin', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
  ConfirmationModal: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  SponsorCRMForm: (props: {
    sponsor: unknown
    initialTierId?: string
    existingSponsorsInCRM?: string[]
    onSuccess: (id?: string) => void
  }) => (
    <div data-testid="create-form">
      <span data-testid="create-mode">{String(props.sponsor === null)}</span>
      <span data-testid="tier">{props.initialTierId ?? ''}</span>
      <span data-testid="in-crm">{props.existingSponsorsInCRM?.join(',')}</span>
      <button onClick={() => props.onSuccess('sfc-new')}>Save new</button>
    </div>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/SponsorRecordPanel', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/admin/sponsor-crm/SponsorRecordPanel')
  >('@/components/admin/sponsor-crm/SponsorRecordPanel')
  return {
    ...actual,
    useRefreshSponsor: () => vi.fn(),
    SponsorRecordPanel: ({
      sponsorId,
      view,
    }: {
      sponsorId: string
      view: string
    }) => (
      <div data-testid="panel">
        {sponsorId}:{view}
      </div>
    ),
  }
})

import { SponsorTierManagement } from '@/components/admin/sponsor/SponsorTierManagement'

const tiers = [
  { _id: 'tier-gold', title: 'Gold', tierType: 'standard', price: [] },
] as unknown as SponsorTierExisting[]
const acme = {
  _sfcId: 'sfc-acme',
  sponsor: { _id: 'sp-acme', name: 'Acme', website: 'https://acme.test' },
  tier: { _id: 'tier-gold', title: 'Gold' },
} as unknown as ConferenceSponsor

const renderPage = () =>
  render(
    <SponsorTierManagement
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
      sponsors={[acme]}
      sponsorTiers={tiers}
      sponsorsByTier={{ Gold: [acme] }}
      sortedTierNames={['Gold']}
    />,
  )

beforeEach(() => {
  nav.query = ''
  nav.push.mockClear()
  nav.refresh.mockClear()
})
afterEach(cleanup)

it('"Add to tier" opens the create form with that tier preselected', () => {
  renderPage()
  expect(screen.queryByTestId('create-form')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Add to tier'))
  expect(screen.getByTestId('create-mode')).toHaveTextContent('true')
  expect(screen.getByTestId('tier')).toHaveTextContent('tier-gold')
  // Sponsors already in this conference are not offered again.
  expect(screen.getByTestId('in-crm')).toHaveTextContent('sp-acme')
})

it('the header "Add Sponsor" opens the create form with no tier', () => {
  renderPage()
  fireEvent.click(screen.getAllByText('Add Sponsor')[0])
  expect(screen.getByTestId('create-mode')).toHaveTextContent('true')
  expect(screen.getByTestId('tier')).toHaveTextContent('')
})

it('a new sponsor continues in the record panel, as on the board', () => {
  renderPage()
  fireEvent.click(screen.getByText('Add to tier'))
  fireEvent.click(screen.getByText('Save new'))
  expect(screen.queryByTestId('create-form')).not.toBeInTheDocument()
  expect(nav.refresh).toHaveBeenCalled()
  expect(nav.push).toHaveBeenCalledWith('?sponsor=sfc-new&view=pipeline', {
    scroll: false,
  })
})

it('"Edit sponsor" opens the shared record panel for that sponsor', () => {
  renderPage()
  fireEvent.click(screen.getByTitle('Edit sponsor'))
  expect(nav.push).toHaveBeenCalledWith('?sponsor=sfc-acme&view=pipeline', {
    scroll: false,
  })
})

it('renders ?sponsor=<id>&view=<tab> as the record panel', () => {
  nav.query = 'sponsor=sfc-acme&view=logo'
  renderPage()
  expect(screen.getByTestId('panel')).toHaveTextContent('sfc-acme:logo')
})
