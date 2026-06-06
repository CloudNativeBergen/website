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
    expect(dropNeedsTier('pipeline', 'closed-won', { tier: undefined })).toBe(
      true,
    )
  })

  it('does not prompt when a tier is already set', () => {
    expect(
      dropNeedsTier('pipeline', 'closed-won', { tier: { _id: 'tier-1' } }),
    ).toBe(false)
  })

  it('does not prompt for other pipeline columns', () => {
    expect(dropNeedsTier('pipeline', 'negotiating', { tier: undefined })).toBe(
      false,
    )
  })

  it('does not prompt on the contract or invoice boards', () => {
    expect(dropNeedsTier('contract', 'closed-won', { tier: undefined })).toBe(
      false,
    )
    expect(dropNeedsTier('invoice', 'closed-won', { tier: undefined })).toBe(
      false,
    )
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
    expect(result.current.pendingTierMove).toBeNull()
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

    expect(mockSetQueryData).toHaveBeenCalledWith(['k1'], [sponsor])
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'Set a sponsor tier before marking as Won.',
      }),
    )
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
  })
})
