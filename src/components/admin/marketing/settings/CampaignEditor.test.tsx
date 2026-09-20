/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const state = {
  fetched: true,
  failed: false,
  data: {
    _id: 'campaign',
    _rev: 'rev-1',
    planId: 'plan',
    key: 'cfp',
    title: 'CFP',
    primaryOutcome: 'cfpSubmissions' as const,
    target: 250,
    outcomeTargetPage: null,
    startMilestone: 'CFP_OPEN' as const,
    startOffsetDays: 0,
    endMilestone: 'CFP_CLOSE' as const,
    endOffsetDays: 0,
    startDate: '2027-01-10',
    endDate: '2027-03-01',
    provisional: false,
    optional: false,
    attached: [],
  },
}
const updateMutate = vi.fn()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    marketing: {
      campaign: {
        editing: {
          useQuery: () => ({
            data: state.data,
            error: null,
            // The editor waits for the opening refetch before latching, so the
            // fake has to say that fetch has happened.
            isFetchedAfterMount: state.fetched,
            isError: state.failed,
          }),
        },
        create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        update: {
          useMutation: () => ({ mutate: updateMutate, isPending: false }),
        },
        invalidate: vi.fn(),
      },
      plan: { get: { invalidate: vi.fn() } },
      report: { invalidate: vi.fn() },
    },
    useUtils: () => ({
      marketing: {
        plan: { get: { invalidate: vi.fn() } },
        campaign: { invalidate: vi.fn() },
        report: { invalidate: vi.fn() },
      },
    }),
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

const { CampaignEditor } = await import('./CampaignEditor')

afterEach(() => {
  cleanup()
  updateMutate.mockClear()
  state.fetched = true
  state.failed = false
  state.data = { ...state.data, _rev: 'rev-1', title: 'CFP', optional: false }
})

describe('an open Campaign editor during a background refetch', () => {
  it('keeps the half-typed title and saves against the revision it loaded', async () => {
    // The form was keyed on `_rev`, so any other save — anyone else\'s, or an
    // invalidation landing a fresh copy — remounted it and threw away whatever
    // the organizer had typed. Keying on the id alone would be worse: the draft
    // would survive while `_rev` advanced, and saving would write the OLD
    // values under the NEW revision, silently erasing the other person\'s edit.
    const { rerender } = render(
      <CampaignEditor campaignId="campaign" onClose={vi.fn()} />,
    )
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'CFP, rewritten' } })

    // Somebody else saves; a background refetch brings their revision.
    state.data = { ...state.data, _rev: 'rev-2', title: 'Their title' }
    rerender(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)

    // The typing is still there, and the field was not replaced.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'CFP, rewritten',
    )

    // And the save carries the revision the form LOADED, so the server\'s
    // compare-and-set rejects it instead of overwriting their work.
    fireEvent.click(screen.getByRole('button', { name: 'Save Campaign' }))
    expect(updateMutate).toHaveBeenCalledTimes(1)
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      campaignId: 'campaign',
      rev: 'rev-1',
      title: 'CFP, rewritten',
    })
  })
})

describe('the Optional flag on an existing Campaign', () => {
  it('shows what the Campaign carries and sends the change', () => {
    render(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)
    const optional = screen.getByLabelText('Optional')
    expect(optional).not.toBeChecked()
    fireEvent.click(optional)
    fireEvent.click(screen.getByRole('button', { name: 'Save Campaign' }))
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign',
        rev: 'rev-1',
        optional: true,
      }),
    )
  })
  it('starts checked when the Campaign is already optional', () => {
    state.data = { ...state.data, optional: true }
    render(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Optional')).toBeChecked()
  })
})

describe('reopening the editor on cached data', () => {
  it('waits for the opening fetch before latching the form', () => {
    // React Query serves the cached Campaign immediately, so gating on
    // `!query.data` mounted the form on the cache — and the form latches its
    // fields and revision on mount, so the fresh response that arrived a moment
    // later was ignored. The organizer saw stale values and got a conflict on
    // their first save, from an editor they had only just opened.
    state.fetched = false
    render(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByText('Loading Campaign…')).toBeInTheDocument()

    state.fetched = true
    cleanup()
    render(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('does not latch cached fields when the opening refetch FAILED', () => {
    // `isFetchedAfterMount` is set after an error update too, so accepting it
    // alone mounted the form on the stale cache and hid the error — the
    // organizer saw old values and got a conflict on their first save, from an
    // editor they had just opened.
    state.fetched = true
    state.failed = true
    render(<CampaignEditor campaignId="campaign" onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Title')).toBeNull()
  })
})
