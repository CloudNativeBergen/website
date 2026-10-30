/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { Conference } from '@/lib/conference/types'

// --- next/navigation -------------------------------------------------------
// router.replace() is deliberately a no-op that never updates searchParams:
// that IS the reported failure mode. Next resolves the replace a tick later,
// so anything re-reading searchParams in between sees the pre-close URL.
const replace = vi.fn()
const push = vi.fn()
const back = vi.fn()
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ replace, push, back }),
  useSearchParams: () => searchParams,
}))

vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: { speaker: { _id: 'speaker-1' } } }),
}))

const listData = vi.fn<() => { data: unknown[]; isLoading: boolean }>()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          list: { invalidate: vi.fn(), getData: () => undefined },
          healthViolations: { invalidate: vi.fn() },
          getById: { invalidate: vi.fn() },
          getOverview: { invalidate: vi.fn() },
          getContacts: { invalidate: vi.fn() },
          getContractDetails: { invalidate: vi.fn() },
          activities: {
            list: { invalidate: vi.fn() },
            log: { invalidate: vi.fn() },
          },
        },
      },
    }),
    sponsor: {
      crm: {
        list: { useQuery: () => listData() },
        getById: {
          useQuery: ({ id }: { id: string }) => ({
            data: { _id: id, sponsor: { name: 'Acme' } },
          }),
        },
        healthViolations: { useQuery: () => ({ data: [], isError: false }) },
        delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
      tiers: { listByConference: { useQuery: () => ({ data: [] }) } },
    },
  },
}))

vi.mock('@/hooks/useSponsorDragDrop', () => ({
  __esModule: true,
  useSponsorDragDrop: () => ({
    activeItem: null,
    isDragging: false,
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleAdvanceStage: vi.fn(),
    pendingTierMove: null,
    confirmTierMove: vi.fn(),
    cancelTierMove: vi.fn(),
  }),
}))

vi.mock('@dnd-kit/core', () => ({
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  __esModule: true,
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  pointerWithin: vi.fn(),
}))

// The modal under test: a stub with a close button, so "is it open?" is a
// single unambiguous DOM question.
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  __esModule: true,
  SponsorCRMForm: ({
    onClose,
    sponsorStartSet,
    presentation,
    initialView,
    sponsor,
  }: {
    onClose: () => void
    sponsorStartSet?: boolean
    presentation?: string
    initialView?: string
    sponsor: { _id: string } | null
  }) => (
    <div
      data-testid={presentation === 'panel' ? 'sponsor-panel' : 'sponsor-form'}
    >
      <button onClick={onClose}>close form</button>
      <span>sponsor start set: {String(sponsorStartSet)}</span>
      <span>
        {sponsor?._id ?? 'new'} on {initialView ?? 'pipeline'}
      </span>
    </div>
  ),
}))

vi.mock('@/components/admin', () => ({
  __esModule: true,
  SponsorSendModal: () => null,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorBoardColumn', () => ({
  __esModule: true,
  SponsorBoardColumn: ({
    columnKey,
    sponsors,
    onSponsorClick,
  }: {
    columnKey: string
    sponsors: { _id: string }[]
    onSponsorClick: (s: { _id: string }) => void
  }) => (
    <div>
      {sponsors.map((s) => (
        <button key={s._id} onClick={() => onSponsorClick(s)}>
          card {s._id} in {columnKey}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/admin/sponsor-crm/SponsorCard', () => ({
  __esModule: true,
  SponsorCard: () => <div />,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorRenewalStrip', () => ({
  SponsorRenewalStrip: () => null,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorBulkActions', () => ({
  __esModule: true,
  SponsorBulkActions: () => <div />,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorDeleteModal', () => ({
  __esModule: true,
  SponsorDeleteModal: () => null,
}))

vi.mock('@/components/admin/sponsor-crm/TierPickerPrompt', () => ({
  __esModule: true,
  TierPickerPrompt: () => null,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorHealthPanel', () => ({
  __esModule: true,
  SponsorHealthPanel: () => null,
}))

// Capture the filter groups so the owner option/selection contract can be
// asserted without driving the sheet's UI.
type FilterGroup = {
  key: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (value: string) => void
}
const filterGroups = vi.fn<(groups: FilterGroup[]) => void>()
vi.mock('@/components/admin/sponsor-crm/MobileFilterSheet', () => ({
  __esModule: true,
  MobileFilterSheet: ({ groups }: { groups: FilterGroup[] }) => {
    filterGroups(groups)
    return null
  },
}))

// Uses IntersectionObserver for its drop-up/drop-down flip; irrelevant here.
vi.mock('@/components/admin/FilterDropdown', () => ({
  __esModule: true,
  FilterDropdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  FilterOption: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

// vi.mock calls are hoisted automatically by Vitest
import { SponsorCRMPipeline } from '@/components/admin/sponsor-crm/SponsorCRMPipeline'

const conference = {
  _id: 'conf-2026',
  title: 'Cloud Native Days Norway 2026',
  organizers: [],
  teams: [],
} as unknown as Conference

const renderPipeline = () =>
  render(
    <SponsorCRMPipeline
      conferenceId="conf-2026"
      conference={conference}
      domain="cloudnativebergen.dev"
    />,
  )

describe('SponsorCRMPipeline — sponsor form open/close', () => {
  beforeEach(() => {
    replace.mockClear()
    push.mockClear()
    back.mockClear()
    searchParams = new URLSearchParams()
    listData.mockReturnValue({
      data: [mockSponsor({ _id: 'sfc-123' })],
      isLoading: false,
    })
  })
  afterEach(cleanup)

  const renderWithNew = (
    workshopRegistrationSponsorStart?: string,
    externalNewTrigger = 1,
  ) =>
    render(
      <SponsorCRMPipeline
        conferenceId="conf-2026"
        conference={{ ...conference, workshopRegistrationSponsorStart }}
        domain="cloudnativebergen.dev"
        externalNewTrigger={externalNewTrigger}
      />,
    )

  // The section that offers an early-access link (#1346) says when a link
  // gives no head start. It is told from the conference this page holds.
  it.each([
    ['2026-10-10T08:00:00Z', true],
    [undefined, false],
  ])(
    'tells the form whether the conference has a sponsor start time (%s)',
    (workshopRegistrationSponsorStart, expected) => {
      renderWithNew(workshopRegistrationSponsorStart)
      expect(screen.getByTestId('sponsor-form')).toHaveTextContent(
        `sponsor start set: ${expected}`,
      )
    },
  )

  // The board keeps its place: a card opens the record in a side panel whose
  // state lives in the URL, so Back closes it.
  it('opens a card in the side panel without leaving the board', () => {
    push.mockImplementation((url: string) => {
      searchParams = new URLSearchParams(url.slice(1))
    })
    const view = renderPipeline()
    fireEvent.click(screen.getByText(/^card sfc-123/))
    expect(push).toHaveBeenCalledWith('?sponsor=sfc-123&view=pipeline', {
      scroll: false,
    })
    expect(push.mock.calls[0][0]).not.toContain('/admin/sponsors/')

    view.rerender(
      <SponsorCRMPipeline
        conferenceId="conf-2026"
        conference={conference}
        domain="cloudnativebergen.dev"
      />,
    )
    expect(screen.getByTestId('sponsor-panel')).toHaveTextContent(
      'sfc-123 on pipeline',
    )
    expect(screen.getByText(/^card sfc-123/)).toBeInTheDocument()

    // Closing a panel this visit opened goes back in history.
    fireEvent.click(screen.getByText('close form'))
    expect(back).toHaveBeenCalled()
    push.mockReset()
  })

  it('closes the panel when Back drops ?sponsor= from the URL', () => {
    searchParams = new URLSearchParams('sponsor=sfc-123&view=contract')
    const view = renderPipeline()
    expect(screen.getByTestId('sponsor-panel')).toBeInTheDocument()
    searchParams = new URLSearchParams()
    view.rerender(
      <SponsorCRMPipeline
        conferenceId="conf-2026"
        conference={conference}
        domain="cloudnativebergen.dev"
      />,
    )
    expect(screen.queryByTestId('sponsor-panel')).not.toBeInTheDocument()
  })

  // Old `crm?sponsor=` links (notifications, bookmarks) open the panel.
  it('opens the panel on the tab an old ?sponsor=&view= link names', () => {
    searchParams = new URLSearchParams('sponsor=sfc-123&view=contract')
    renderPipeline()
    expect(screen.getByTestId('sponsor-panel')).toHaveTextContent(
      'sfc-123 on contract',
    )
    // Arriving on the link pushed nothing, so close strips the params.
    fireEvent.click(screen.getByText('close form'))
    expect(back).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith(
      expect.not.stringContaining('sponsor='),
      { scroll: false },
    )
  })

  it('does not open anything when the URL names no sponsor', () => {
    renderPipeline()
    expect(screen.queryByTestId('sponsor-form')).not.toBeInTheDocument()
  })
})

describe('SponsorCRMPipeline — mobile owner filter', () => {
  const ownerGroup = () => {
    const groups = filterGroups.mock.calls.at(-1)?.[0] ?? []
    const owner = groups.find((g) => g.key === 'owner')
    if (!owner) throw new Error('owner filter group not rendered')
    return owner
  }

  beforeEach(() => {
    vi.clearAllMocks()
    searchParams = new URLSearchParams()
    listData.mockReturnValue({ data: [], isLoading: false })
  })
  afterEach(cleanup)

  /**
   * Regression: option values were switched to JSON payloads to kill a
   * `startsWith('team:')` prefix collision, but "Unassigned" kept a bare
   * string while `selected` encoded every non-team filter as an org id. The
   * filter applied, yet the control never showed it as chosen.
   */
  it('marks Unassigned as selected when it is the active filter', () => {
    searchParams = new URLSearchParams('assignedTo=unassigned')
    renderPipeline()

    const owner = ownerGroup()
    const unassigned = owner.options.find((o) => o.label === 'Unassigned')
    expect(unassigned).toBeDefined()
    expect(owner.selected).toContain(unassigned!.value)
  })

  it('applies the Unassigned filter when its option is chosen', () => {
    renderPipeline()

    const owner = ownerGroup()
    const unassigned = owner.options.find((o) => o.label === 'Unassigned')!
    // Nothing is selected before the choice...
    expect(owner.selected).not.toContain(unassigned.value)

    owner.onChange(unassigned.value)

    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toContain('assignedTo=unassigned')
  })

  it('still marks All as selected when no owner filter is set', () => {
    renderPipeline()
    expect(ownerGroup().selected).toContain('')
  })
})

describe('SponsorCRMPipeline — ?action= filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listData.mockReturnValue({
      data: [
        mockSponsor({ _id: 'sfc-late', invoiceStatus: 'overdue' }),
        mockSponsor({ _id: 'sfc-fine' }),
      ],
      isLoading: false,
    })
  })
  afterEach(cleanup)

  it('shows only sponsors with an open item of that type, as a chip', () => {
    searchParams = new URLSearchParams('action=overdue')
    renderPipeline()
    expect(screen.getByText(/^card sfc-late/)).toBeInTheDocument()
    expect(screen.queryByText(/^card sfc-fine/)).not.toBeInTheDocument()
    // Keeps every owner: the default "my sponsors" lens would hide unassigned.
    expect(replace).not.toHaveBeenCalledWith(
      expect.stringContaining('assignedTo='),
      expect.anything(),
    )

    fireEvent.click(screen.getByRole('button', { name: /overdue invoices/i }))
    expect(push.mock.calls.at(-1)?.[0]).not.toContain('action=')
  })

  it('shows mine plus unassigned for assignedTo=me-unassigned', () => {
    listData.mockReturnValue({
      data: [
        mockSponsor({
          _id: 'sfc-mine',
          invoiceStatus: 'overdue',
          assignedTo: { _id: 'speaker-1', name: 'Me', email: 'me@x.no' },
        }),
        mockSponsor({ _id: 'sfc-nobody', invoiceStatus: 'overdue' }),
        mockSponsor({
          _id: 'sfc-theirs',
          invoiceStatus: 'overdue',
          assignedTo: { _id: 'other', name: 'Other', email: 'o@x.no' },
        }),
      ],
      isLoading: false,
    })
    searchParams = new URLSearchParams(
      'action=overdue&assignedTo=me-unassigned',
    )
    renderPipeline()
    expect(screen.getByText(/^card sfc-mine/)).toBeInTheDocument()
    expect(screen.getByText(/^card sfc-nobody/)).toBeInTheDocument()
    expect(screen.queryByText(/^card sfc-theirs/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Owner filter: Mine \+ no owner/ }),
    ).toBeInTheDocument()
  })

  it('shows every sponsor with any open item for action=all', () => {
    searchParams = new URLSearchParams('action=all')
    renderPipeline()
    expect(screen.getByText(/^card sfc-late/)).toBeInTheDocument()
    expect(screen.getByText(/^card sfc-fine/)).toBeInTheDocument()
  })

  it('Clear all drops the filters and keeps the board and open sponsor', () => {
    searchParams = new URLSearchParams(
      'board=invoice&action=overdue&tags=x&sponsor=sfc-late&view=contacts',
    )
    renderPipeline()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(push).toHaveBeenLastCalledWith(
      '?board=invoice&sponsor=sfc-late&view=contacts',
      { scroll: false },
    )
  })

  it('names the mobile search toggle and says whether it is open', () => {
    renderPipeline()
    const toggle = screen.getByRole('button', { name: 'Search sponsors' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
