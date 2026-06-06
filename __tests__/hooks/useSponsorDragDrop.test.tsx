/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'
import { dropNeedsTier, useSponsorDragDrop } from '@/hooks/useSponsorDragDrop'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

const mockMoveStage = vi.fn(() => Promise.resolve())
const mockUpdate = vi.fn(() => Promise.resolve())
const mockUpdateInvoice = vi.fn(() => Promise.resolve())
const mockUpdateContract = vi.fn(() => Promise.resolve())
const mockShowNotification = vi.fn()
const mockListCancel = vi.fn(() => Promise.resolve())
const mockListInvalidate = vi.fn()
const mockGetQueriesData = vi.fn(() => [] as unknown[])
const mockSetQueriesData = vi.fn()
const mockSetQueryData = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: {
        crm: {
          list: { cancel: mockListCancel, invalidate: mockListInvalidate },
        },
      },
    }),
    sponsor: {
      crm: {
        moveStage: { useMutation: () => ({ mutateAsync: mockMoveStage }) },
        update: { useMutation: () => ({ mutateAsync: mockUpdate }) },
        updateInvoiceStatus: {
          useMutation: () => ({ mutateAsync: mockUpdateInvoice }),
        },
        updateContractStatus: {
          useMutation: () => ({ mutateAsync: mockUpdateContract }),
        },
      },
    },
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: mockGetQueriesData,
    setQueriesData: mockSetQueriesData,
    setQueryData: mockSetQueryData,
  }),
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: mockShowNotification }),
}))

function makeSponsor(
  overrides: Partial<SponsorForConferenceExpanded> = {},
): SponsorForConferenceExpanded {
  return {
    _id: 'spc-1',
    status: 'negotiating',
    contractStatus: 'none',
    invoiceStatus: 'not-sent',
    tier: undefined,
    ...overrides,
  } as unknown as SponsorForConferenceExpanded
}

function dragEvent(
  sponsor: SponsorForConferenceExpanded,
  sourceColumnKey: string,
  targetColumnKey: string,
): DragEndEvent {
  return {
    active: {
      id: sponsor._id,
      data: { current: { type: 'sponsor', sponsor, sourceColumnKey } },
    },
    over: {
      id: targetColumnKey,
      data: { current: { type: 'column', columnKey: targetColumnKey } },
    },
  } as unknown as DragEndEvent
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dropNeedsTier', () => {
  it('flags a tierless pipeline drop onto closed-won', () => {
    expect(
      dropNeedsTier('pipeline', 'negotiating', 'closed-won', {
        tier: undefined,
      }),
    ).toBe(true)
  })

  it('does not prompt when a tier is already set', () => {
    expect(
      dropNeedsTier('pipeline', 'negotiating', 'closed-won', {
        tier: { _id: 'tier-1' },
      }),
    ).toBe(false)
    // a tier supplied as a bare id string also counts as set
    expect(
      dropNeedsTier('pipeline', 'negotiating', 'closed-won', {
        tier: 'tier-1',
      }),
    ).toBe(false)
  })

  it('does not prompt for transitions the shared guard allows', () => {
    // moving to an unguarded column never needs a tier
    expect(
      dropNeedsTier('pipeline', 'contacted', 'negotiating', {
        tier: undefined,
      }),
    ).toBe(false)
    // a same-state move is a no-op the guard permits
    expect(
      dropNeedsTier('pipeline', 'closed-won', 'closed-won', {
        tier: undefined,
      }),
    ).toBe(false)
  })

  it('does not prompt on the contract or invoice boards', () => {
    expect(
      dropNeedsTier('contract', 'verbal-agreement', 'contract-sent', {
        tier: undefined,
      }),
    ).toBe(false)
    expect(
      dropNeedsTier('invoice', 'not-sent', 'sent', { tier: undefined }),
    ).toBe(false)
  })
})

describe('useSponsorDragDrop — guided completion', () => {
  it('opens a tier prompt instead of moving a tierless sponsor to closed-won', async () => {
    const sponsor = makeSponsor({ tier: undefined, status: 'negotiating' })
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'closed-won'),
      )
    })

    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockShowNotification).not.toHaveBeenCalled()
    // The move is held: nothing is optimistically applied, so the card stays in
    // its source column until a tier is chosen.
    expect(mockListCancel).not.toHaveBeenCalled()
    expect(mockSetQueriesData).not.toHaveBeenCalled()
    expect(result.current.pendingTierMove).toEqual({
      sponsor,
      targetColumnKey: 'closed-won',
    })
  })

  it('completes the move in one atomic update when a tier is chosen', async () => {
    const sponsor = makeSponsor({ tier: undefined, status: 'negotiating' })
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'closed-won'),
      )
    })

    await act(async () => {
      await result.current.confirmTierMove('tier-gold')
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'spc-1',
      tier: 'tier-gold',
      status: 'closed-won',
    })
    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockShowNotification).not.toHaveBeenCalled()
    // The guided path runs through the shared optimistic machinery: cancel
    // in-flight refetches, apply the optimistic move, then reconcile.
    expect(mockListCancel).toHaveBeenCalled()
    expect(mockSetQueriesData).toHaveBeenCalledTimes(1)
    expect(mockListInvalidate).toHaveBeenCalledTimes(1)
    expect(result.current.pendingTierMove).toBeNull()

    // The optimistic updater sets BOTH status and the chosen tier, so the card
    // never shows as tierless in closed-won before the refetch lands.
    const updater = mockSetQueriesData.mock.calls[0][1] as (
      old: SponsorForConferenceExpanded[],
    ) => SponsorForConferenceExpanded[]
    const next = updater([sponsor])
    expect(next[0].status).toBe('closed-won')
    expect(next[0].tier).toEqual({ _id: 'tier-gold' })
  })

  it('rolls back and surfaces the guard message when the completion fails', async () => {
    const sponsor = makeSponsor({ tier: undefined, status: 'negotiating' })
    const snapshot = [['k1'], [sponsor]]
    mockGetQueriesData.mockReturnValueOnce([snapshot])
    mockUpdate.mockRejectedValueOnce(
      Object.assign(new Error('Set a sponsor tier before marking as Won.'), {
        data: { code: 'PRECONDITION_FAILED' },
      }),
    )
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'closed-won'),
      )
    })
    await act(async () => {
      await result.current.confirmTierMove('tier-gold')
    })

    // Optimistic move applied, then rolled back to the snapshot on failure.
    expect(mockSetQueriesData).toHaveBeenCalledTimes(1)
    expect(mockSetQueryData).toHaveBeenCalledWith(['k1'], [sponsor])
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'Set a sponsor tier before marking as Won.',
      }),
    )
    // Still reconciles with the server even after a failed move.
    expect(mockListInvalidate).toHaveBeenCalledTimes(1)
    expect(result.current.pendingTierMove).toBeNull()
  })

  it('leaves the sponsor put when the tier prompt is cancelled', async () => {
    const sponsor = makeSponsor({ tier: undefined, status: 'negotiating' })
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'closed-won'),
      )
    })

    act(() => {
      result.current.cancelTierMove()
    })

    expect(result.current.pendingTierMove).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockSetQueriesData).not.toHaveBeenCalled()
  })

  it('moves a sponsor that already has a tier straight to closed-won', async () => {
    const sponsor = makeSponsor({
      tier: { _id: 'tier-1' } as SponsorForConferenceExpanded['tier'],
      status: 'negotiating',
    })
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'closed-won'),
      )
    })

    expect(mockMoveStage).toHaveBeenCalledTimes(1)
    expect(mockMoveStage).toHaveBeenCalledWith({
      id: 'spc-1',
      newStatus: 'closed-won',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(result.current.pendingTierMove).toBeNull()

    // The optimistic updater flips status (and only status) for the pipeline
    // board — guards applyOptimisticMove's pipeline arm against a field misroute.
    const updater = mockSetQueriesData.mock.calls[0][1] as (
      old: SponsorForConferenceExpanded[],
    ) => SponsorForConferenceExpanded[]
    const next = updater([sponsor])
    expect(next[0].status).toBe('closed-won')
    expect(next[0].invoiceStatus).toBe(sponsor.invoiceStatus)
  })

  it('confirmTierMove is a no-op when nothing is pending', async () => {
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.confirmTierMove('tier-gold')
    })

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockSetQueriesData).not.toHaveBeenCalled()
  })
})

describe('useSponsorDragDrop — direct moves (non-guided)', () => {
  it('routes an invoice-board drag through the invoice mutation', async () => {
    const sponsor = makeSponsor({ invoiceStatus: 'not-sent' })
    const { result } = renderHook(() => useSponsorDragDrop('invoice'))

    await act(async () => {
      await result.current.handleDragEnd(dragEvent(sponsor, 'not-sent', 'sent'))
    })

    expect(mockUpdateInvoice).toHaveBeenCalledWith({
      id: 'spc-1',
      newStatus: 'sent',
    })
    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockUpdateContract).not.toHaveBeenCalled()
    expect(mockListInvalidate).toHaveBeenCalledTimes(1)

    // The optimistic updater flips invoiceStatus and only that — proving the
    // refactored switch routes the invoice board to the invoice field.
    const updater = mockSetQueriesData.mock.calls[0][1] as (
      old: SponsorForConferenceExpanded[],
    ) => SponsorForConferenceExpanded[]
    const next = updater([sponsor])
    expect(next[0].invoiceStatus).toBe('sent')
    expect(next[0].status).toBe(sponsor.status)
  })

  it('routes a contract-board drag through the contract mutation', async () => {
    const sponsor = makeSponsor({ contractStatus: 'none' })
    const { result } = renderHook(() => useSponsorDragDrop('contract'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'none', 'contract-sent'),
      )
    })

    expect(mockUpdateContract).toHaveBeenCalledWith({
      id: 'spc-1',
      newStatus: 'contract-sent',
    })
    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockUpdateInvoice).not.toHaveBeenCalled()
  })

  it('does nothing when a card is dropped back on its own column', async () => {
    const sponsor = makeSponsor({ status: 'negotiating' })
    const { result } = renderHook(() => useSponsorDragDrop('pipeline'))

    await act(async () => {
      await result.current.handleDragEnd(
        dragEvent(sponsor, 'negotiating', 'negotiating'),
      )
    })

    // No wasted mutation or optimistic write for an in-place drop.
    expect(mockMoveStage).not.toHaveBeenCalled()
    expect(mockSetQueriesData).not.toHaveBeenCalled()
    expect(mockListCancel).not.toHaveBeenCalled()
    expect(result.current.pendingTierMove).toBeNull()
  })
})
