/**
 * @vitest-environment jsdom
 *
 * THE STORED SPONSOR↔CODE LINK in the discount code manager (#1262).
 *
 * A sponsor that stores codes is matched by them ALONE: its row counts the
 * stored code (whatever it is called) and no longer claims a code by its name,
 * which then reads as standalone. A standalone code can be ASSIGNED to a
 * sponsor without sending it — asserted on the mutation arguments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
  waitFor,
  act,
} from '@testing-library/react'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'

type UsagePayload =
  inferRouterOutputs<AppRouter>['tickets']['admin']['getDiscountCodesWithUsage']

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
)

const q = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidate: vi.fn(),
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  assign: vi.fn(),
  refresh: vi.fn(),
  createOptions: undefined as unknown,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: q.refresh }),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      tickets: {
        admin: { getDiscountCodesWithUsage: { invalidate: q.invalidate } },
      },
    }),
    tickets: {
      admin: {
        getDiscountCodesWithUsage: { useQuery: q.useQuery },
        createDiscountCode: {
          useMutation: (opts: unknown) => {
            q.createOptions = opts
            return { mutate: q.createMutate, isPending: false }
          },
        },
        deleteDiscountCode: {
          useMutation: () => ({ mutate: q.deleteMutate, isPending: false }),
        },
      },
    },
    sponsor: {
      crm: {
        assignDiscountCodes: {
          useMutation: () => ({ mutateAsync: q.assign, isPending: false }),
        },
      },
    },
  },
}))

import { DiscountCodeManager } from './DiscountCodeManager'
import { NotificationProvider } from './NotificationProvider'

const CONFERENCE = {
  title: 'Konf 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-10',
  domains: ['konf.example'],
  contactEmail: 'organizers@konf.example',
  domain: 'konf.example',
}

const sponsor = (linkedCodes: string[]) => ({
  id: 'sponsor-acme',
  name: 'Acme Cloud',
  tier: { title: 'Gold', tagline: '', tierType: 'standard' as const },
  ticketEntitlement: 5,
  sponsorForConferenceId: 'sfc-acme',
  linkedCodes,
})

const discount = (triggerValue: string, usageCount: number) => ({
  id: triggerValue,
  trigger: 'coupon',
  triggerValue,
  type: 'percentage',
  value: '100',
  affects: 'total',
  affectsValue: null,
  includeBooking: false,
  modes: [],
  tickets: ['1'],
  ticketsOnly: true,
  timesTotal: 10,
  times: 0,
  actualUsage: { usageCount, ticketIds: [], totalPaid: 0 },
})

const PAYLOAD: UsagePayload = {
  success: true,
  discounts: [
    discount('ACMECLOUD1234', 4),
    discount('COMP-7Q2', 2),
    discount('COMMUNITY2026', 9),
  ],
  ticketTypes: [{ id: 1, name: 'Sponsor Pass', description: null }],
  totalTickets: 120,
  count: 3,
  usageStatus: 'resolved',
  conferenceInfo: { customerId: 7, eventId: 4242, title: 'Konf 2026' },
}

function renderPanel(
  linkedCodes: string[],
  otherCodeHolders: { id: string; name: string; linkedCodes: string[] }[] = [],
) {
  q.useQuery.mockReturnValue({ data: PAYLOAD, isLoading: false, error: null })
  return render(
    <NotificationProvider>
      <DiscountCodeManager
        sponsors={[sponsor(linkedCodes)]}
        otherCodeHolders={otherCodeHolders}
        eventId={4242}
        providerLabel="Checkin.no"
        conference={CONFERENCE}
        defaultCustomDiscountsExpanded={true}
      />
    </NotificationProvider>,
  )
}

const codeTable = () =>
  document.getElementById('discount-codes-section') as HTMLElement
const sponsorTable = () =>
  document.getElementById('sponsor-discount-codes-section') as HTMLElement

function codeRow(code: string): HTMLElement {
  const row = within(codeTable())
    .getAllByText(code)
    .map((el) => el.closest('tr'))
    .find((el): el is HTMLTableRowElement => el !== null)
  if (!row) throw new Error(`no code-table row rendered for ${code}`)
  return row
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('attribution by the stored link', () => {
  // The code table lists the codes NO sponsor owns; an owned code shows in
  // its sponsor's row instead. So which table a code sits in IS the answer.
  const inCodeTable = (code: string) =>
    within(codeTable()).queryAllByText(code).length > 0
  const inSponsorTable = (code: string) =>
    within(sponsorTable()).queryAllByText(code).length > 0

  it('without stored codes, the name heuristic still claims the sponsor-named code', () => {
    renderPanel([])
    expect(inSponsorTable('ACMECLOUD1234')).toBe(true)
    expect(inCodeTable('ACMECLOUD1234')).toBe(false)
    expect(inCodeTable('COMP-7Q2')).toBe(true)
    expect(inSponsorTable('COMP-7Q2')).toBe(false)
  })

  it('a stored code is the sponsor’s whatever it is called, and the name stops claiming', () => {
    renderPanel(['comp-7q2'])
    expect(inSponsorTable('COMP-7Q2')).toBe(true)
    expect(inCodeTable('COMP-7Q2')).toBe(false)
    expect(within(codeRow('ACMECLOUD1234')).getByText('Standalone'))
    expect(inSponsorTable('ACMECLOUD1234')).toBe(false)
  })
})

describe('Assign to sponsor', () => {
  it('links a standalone code to the chosen sponsor without sending', async () => {
    q.assign.mockResolvedValue({
      success: true,
      linkedCodes: ['COMMUNITY2026'],
    })
    renderPanel([])
    fireEvent.click(
      within(codeRow('COMMUNITY2026')).getByRole('button', {
        name: 'Assign COMMUNITY2026 to a sponsor',
      }),
    )
    fireEvent.change(await screen.findByLabelText('Sponsor'), {
      target: { value: 'sfc-acme' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(q.refresh).toHaveBeenCalled())
    expect(q.assign).toHaveBeenCalledWith({
      sponsorForConferenceId: 'sfc-acme',
      discountCodes: ['COMMUNITY2026'],
    })
  })

  it('offers Assign on every unowned code, and on none a sponsor owns', () => {
    renderPanel([])
    expect(
      screen.queryAllByRole('button', {
        name: 'Assign ACMECLOUD1234 to a sponsor',
      }),
    ).toHaveLength(0)
    expect(
      screen.getAllByRole('button', { name: 'Assign COMP-7Q2 to a sponsor' })
        .length,
    ).toBeGreaterThan(0)
  })
})

describe('a code created from a sponsor row (#1262)', () => {
  it('is created FOR the sponsor’s CRM record, and counts on its row once linked', () => {
    // Acme stores only a code that no longer exists at the provider, so its
    // row has no code and offers Create.
    renderPanel(['GONE-CODE'])
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Create discount code for Acme Cloud',
      })[0],
    )
    const sent = q.createMutate.mock.calls[0][0]
    expect(sent).toMatchObject({
      sponsorName: 'Acme Cloud',
      sponsorForConferenceId: 'sfc-acme',
    })

    // The server links the code and says so: the row adopts it at once.
    const { onSuccess } = q.createOptions as {
      onSuccess: (data: unknown, variables: unknown) => void
    }
    act(() =>
      onSuccess(
        { discountCode: 'COMMUNITY2026', linkedCodes: ['COMMUNITY2026'] },
        sent,
      ),
    )
    expect(
      within(sponsorTable()).queryAllByText('COMMUNITY2026').length,
    ).toBeGreaterThan(0)
    expect(within(codeTable()).queryAllByText('COMMUNITY2026')).toHaveLength(0)
  })
})

/**
 * A code stored on a CRM row that is not a conference sponsor (not yet
 * closed-won) stays that row's (#1262 adversarial review): it is not counted
 * on a sponsor row by name, says whose it is, and offers no Assign — the
 * server would refuse it.
 */
describe('a code stored on a sponsor outside the conference list', () => {
  const ACME_LABS = {
    id: 'sponsor-acme-labs',
    name: 'Acme Labs',
    linkedCodes: ['ACMECLOUD1234'],
  }

  it('is not claimed by a sponsor row whose name it contains', () => {
    renderPanel([], [ACME_LABS])
    expect(within(sponsorTable()).queryAllByText('ACMECLOUD1234')).toHaveLength(
      0,
    )
    expect(within(codeRow('ACMECLOUD1234')).getByText('Linked to Acme Labs'))
  })

  it('offers no Assign for it', () => {
    renderPanel([], [ACME_LABS])
    expect(
      screen.queryAllByRole('button', {
        name: 'Assign ACMECLOUD1234 to a sponsor',
      }),
    ).toHaveLength(0)
  })
})
