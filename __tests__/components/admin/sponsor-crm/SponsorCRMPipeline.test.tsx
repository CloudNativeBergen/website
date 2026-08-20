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
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ replace, push: vi.fn() }),
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
        },
      },
    }),
    sponsor: {
      crm: {
        list: { useQuery: () => listData() },
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
  __esModule: true,
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  pointerWithin: vi.fn(),
}))

// The modal under test: a stub with a close button, so "is it open?" is a
// single unambiguous DOM question.
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  __esModule: true,
  SponsorCRMForm: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sponsor-form">
      <button onClick={onClose}>close form</button>
    </div>
  ),
}))

vi.mock('@/components/admin', () => ({
  __esModule: true,
  SponsorIndividualEmailModal: () => null,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorBoardColumn', () => ({
  __esModule: true,
  SponsorBoardColumn: () => <div />,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorCard', () => ({
  __esModule: true,
  SponsorCard: () => <div />,
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

vi.mock('@/components/admin/sponsor-crm/MobileFilterSheet', () => ({
  __esModule: true,
  MobileFilterSheet: () => null,
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
    searchParams = new URLSearchParams('sponsor=sfc-123')
    listData.mockReturnValue({
      data: [mockSponsor({ _id: 'sfc-123' })],
      isLoading: false,
    })
  })
  afterEach(cleanup)

  it('restores the sponsor form from ?sponsor=', () => {
    renderPipeline()
    expect(screen.getByTestId('sponsor-form')).toBeInTheDocument()
  })

  /**
   * Regression: the restore effect had no once-guard, so every re-render that
   * happened before router.replace() landed — the isFormOpen flip itself, or
   * the list refetch the close triggers — re-read the stale `?sponsor=<id>`
   * and re-opened the modal. Users reported closing the card several times.
   */
  it('stays closed after Close, while the URL is still catching up', () => {
    const { rerender } = renderPipeline()
    expect(screen.getByTestId('sponsor-form')).toBeInTheDocument()

    fireEvent.click(screen.getByText('close form'))
    expect(screen.queryByTestId('sponsor-form')).not.toBeInTheDocument()

    // The close did ask for the param to go away...
    expect(replace).toHaveBeenCalled()
    expect(replace.mock.calls.at(-1)?.[0]).not.toContain('sponsor=sfc-123')

    // ...but until that lands, `searchParams` still says sponsor=sfc-123, and
    // the list invalidation hands back a new array identity. Neither may
    // resurrect the modal.
    listData.mockReturnValue({
      data: [mockSponsor({ _id: 'sfc-123' })],
      isLoading: false,
    })
    rerender(
      <SponsorCRMPipeline
        conferenceId="conf-2026"
        conference={conference}
        domain="cloudnativebergen.dev"
      />,
    )

    expect(screen.queryByTestId('sponsor-form')).not.toBeInTheDocument()
  })

  it('does not open anything when the URL names no sponsor', () => {
    searchParams = new URLSearchParams()
    renderPipeline()
    expect(screen.queryByTestId('sponsor-form')).not.toBeInTheDocument()
  })

  it('waits for the board data before giving up on an id', () => {
    listData.mockReturnValue({ data: [], isLoading: true })
    const { rerender } = renderPipeline()
    expect(screen.queryByTestId('sponsor-form')).not.toBeInTheDocument()

    listData.mockReturnValue({
      data: [mockSponsor({ _id: 'sfc-123' })],
      isLoading: false,
    })
    rerender(
      <SponsorCRMPipeline
        conferenceId="conf-2026"
        conference={conference}
        domain="cloudnativebergen.dev"
      />,
    )

    expect(screen.getByTestId('sponsor-form')).toBeInTheDocument()
  })
})
