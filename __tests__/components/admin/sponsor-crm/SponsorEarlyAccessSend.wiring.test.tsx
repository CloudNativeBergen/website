/**
 * @vitest-environment jsdom
 *
 * FROM THE BUTTON TO THE MODAL (#1347): "Send by email" in the workshop
 * early-access section of a sponsor's record opens the Send modal on the
 * "Workshop early access" kind, for that sponsor.
 *
 * The intent travels through three components (the section, the contract
 * view, the record's form) to the board's side panel, which owns the modal. A prop
 * dropped on the way leaves no button and no error, so the REAL four are
 * rendered here together. Stubbed: the board around them, the panels of the
 * record this is not about, and the Send modal itself (its own behaviour is
 * pinned in `SponsorSendModal.earlyAccess.test.tsx`).
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { Conference } from '@/lib/conference/types'

let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams,
}))
vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: { speaker: { _id: 'speaker-1', name: 'Org' } } }),
}))

const h = vi.hoisted(() => ({
  sponsors: [] as unknown[],
  /** Every procedure whose query was enabled or whose fetch was called. */
  asked: [] as string[],
}))
/** A stub for what stands around the four components under test. */
const { nothing } = vi.hoisted(() => ({ nothing: () => null }))
/**
 * Every tRPC procedure answers "nothing yet", except the sponsor list. What
 * matters here is which component hands what to which, not their data.
 */
vi.mock('@/lib/trpc/client', () => {
  const procedure = (path: string) => ({
    useQuery: (_input: unknown, options?: { enabled?: boolean }) => {
      if (options?.enabled !== false) h.asked.push(path)
      return path === 'sponsor.crm.getById'
        ? { data: h.sponsors[0], isLoading: false }
        : { data: undefined, isLoading: false, isError: false }
    },
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    invalidate: vi.fn(),
    getData: () => undefined,
    fetch: async () => {
      h.asked.push(path)
      return {}
    },
  })
  const node = (path: string): unknown =>
    new Proxy(procedure(path), {
      get: (target, key: string) =>
        key in target
          ? target[key as keyof typeof target]
          : node(path ? `${path}.${key}` : key),
    })
  return {
    api: new Proxy(
      {},
      {
        get: (_target, key: string) =>
          key === 'useUtils' ? () => node('') : node(key),
      },
    ),
  }
})

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
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
vi.mock('@/hooks/useSponsorCRMFormMutations', () => ({
  __esModule: true,
  useSponsorCRMFormMutations: () => ({
    handleSubmit: vi.fn(),
    isPending: false,
  }),
}))

/** The Send modal, as the pipeline opens it: which kind, for whom. */
vi.mock('@/components/admin', () => ({
  __esModule: true,
  SponsorSendModal: (props: {
    isOpen: boolean
    kind: string
    sponsorForConference: { _id: string }
  }) =>
    props.isOpen ? (
      <div data-testid="send-modal">
        {props.kind} for {props.sponsorForConference._id}
      </div>
    ) : null,
}))

vi.mock('@/components/admin/sponsor-crm/SponsorBoardColumn', () => ({
  __esModule: true,
  SponsorBoardColumn: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCard', () => ({
  __esModule: true,
  SponsorCard: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorBulkActions', () => ({
  __esModule: true,
  SponsorBulkActions: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorDeleteModal', () => ({
  __esModule: true,
  SponsorDeleteModal: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/TierPickerPrompt', () => ({
  __esModule: true,
  TierPickerPrompt: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorHealthPanel', () => ({
  __esModule: true,
  SponsorHealthPanel: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/MobileFilterSheet', () => ({
  __esModule: true,
  MobileFilterSheet: nothing,
}))
vi.mock('@/components/admin/FilterDropdown', () => ({
  __esModule: true,
  FilterDropdown: nothing,
  FilterOption: nothing,
}))
// Of the sponsor's record, only the contract view and its early-access
// section are real.
vi.mock('@/components/admin/sponsor-crm/SponsorPipelineView', () => ({
  __esModule: true,
  SponsorPipelineView: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorMessagesPanel', () => ({
  __esModule: true,
  SponsorMessagesPanel: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCommunicationsPanel', () => ({
  __esModule: true,
  SponsorCommunicationsPanel: nothing,
}))
vi.mock('@/components/admin/sponsor/SponsorActivityTimeline', () => ({
  __esModule: true,
  SponsorActivityTimeline: nothing,
}))
vi.mock('@/components/admin/sponsor/SponsorContactEditor', () => ({
  __esModule: true,
  SponsorContactEditor: nothing,
}))
vi.mock('@/components/admin/sponsor/SponsorLogoEditor', () => ({
  __esModule: true,
  SponsorLogoEditor: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/ContractReadinessIndicator', () => ({
  __esModule: true,
  ContractReadinessIndicator: nothing,
}))
vi.mock('@/components/admin/sponsor-crm/SponsorPortalSection', () => ({
  __esModule: true,
  SponsorPortalSection: nothing,
}))
vi.mock('@/components/admin/OrganizerSignatureCapture', () => ({
  __esModule: true,
  OrganizerSignatureCapture: nothing,
}))

import { SponsorCRMPipeline } from '@/components/admin/sponsor-crm/SponsorCRMPipeline'

const conference = {
  _id: 'conf-2026',
  title: 'Cloud Native Days Norway 2026',
  organizers: [],
  teams: [],
  workshopRegistrationSponsorStart: '2026-09-24T08:00:00.000Z',
} as unknown as Conference

/** The sponsor's record, open in the board's panel on its contract view. */
function openRecord(
  sponsor: Parameters<typeof mockSponsor>[0],
  workshopsEnabled = true,
) {
  h.sponsors = [mockSponsor({ _id: 'sfc-acme', ...sponsor })]
  searchParams = new URLSearchParams(
    'assignedTo=speaker-1&sponsor=sfc-acme&view=contract',
  )
  return render(
    <SponsorCRMPipeline
      conferenceId="conf-2026"
      conference={conference}
      domain="cloudnativebergen.dev"
      workshopsEnabled={workshopsEnabled}
    />,
  )
}

beforeEach(() => {
  h.asked = []
})
afterEach(cleanup)

describe('"Send by email" in the early-access section', () => {
  it.each([
    ['a sponsor without a link', false],
    ['a sponsor with a link', true],
  ])(
    'opens the Send modal on the workshop early-access kind for %s',
    async (_case, hasWorkshopEarlyAccessLink) => {
      openRecord({ status: 'closed-won', hasWorkshopEarlyAccessLink })
      expect(screen.queryByTestId('send-modal')).toBeNull()

      fireEvent.click(
        await screen.findByRole('button', { name: 'Send by email' }),
      )

      expect(screen.getByTestId('send-modal')).toHaveTextContent(
        'workshop-early-access for sfc-acme',
      )
    },
  )

  it('is not offered with workshops off: the link that exists can only be revoked', async () => {
    openRecord(
      { status: 'closed-won', hasWorkshopEarlyAccessLink: true },
      false,
    )

    expect(await screen.findByRole('button', { name: 'Revoke' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Send by email' })).toBeNull()
  })

  it('viewing the record asks nothing about the link: no readiness, no address', async () => {
    openRecord({ status: 'closed-won', hasWorkshopEarlyAccessLink: true })
    await screen.findByRole('button', { name: 'Send by email' })

    expect(h.asked.filter((path) => path.includes('earlyAccess'))).toEqual([])
    // The mock does record what IS asked.
    expect(h.asked).toContain('sponsor.crm.getById')
  })
})
