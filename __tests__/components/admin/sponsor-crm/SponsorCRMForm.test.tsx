/**
 * @vitest-environment jsdom
 */
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { SponsorCRMFormData } from '@/hooks/useSponsorCRMFormMutations'

// The header CTA is the unit under test; everything below it is a stub so the
// assertions can't be satisfied by some other part of the form.
vi.mock('@/lib/trpc/client', () => {
  const emptyQuery = () => ({ data: [] })
  return {
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
        list: { useQuery: emptyQuery },
        tiers: { listByConference: { useQuery: emptyQuery } },
        crm: { listOrganizers: { useQuery: emptyQuery } },
      },
    },
  }
})

let submitForm = vi.fn<(data: SponsorCRMFormData) => Promise<void>>()
vi.mock('@/hooks/useSponsorCRMFormMutations', () => ({
  __esModule: true,
  useSponsorCRMFormMutations: () => ({
    handleSubmit: (data: SponsorCRMFormData) => submitForm(data),
    isPending: false,
  }),
}))

vi.mock('@/components/admin/sponsor-crm/SponsorPipelineView', () => ({
  __esModule: true,
  SponsorPipelineView: () => <div data-testid="pipeline-view" />,
}))

// Renders the status of the PERSISTED sponsor prop — the value the real
// contract view gates on (`isSponsorWon`).
vi.mock('@/components/admin/sponsor-crm/SponsorContractView', () => ({
  __esModule: true,
  SponsorContractView: ({
    sponsor,
  }: {
    sponsor: SponsorForConferenceExpanded
  }) => (
    <div data-testid="contract-view">persisted status: {sponsor.status}</div>
  ),
}))

vi.mock('@/components/admin/sponsor-crm/SponsorMessagesPanel', () => ({
  __esModule: true,
  SponsorMessagesPanel: () => <div />,
}))

vi.mock('@/components/admin/sponsor/SponsorActivityTimeline', () => ({
  __esModule: true,
  SponsorActivityTimeline: () => <div />,
}))

vi.mock('@/components/admin/sponsor/SponsorContactEditor', () => ({
  __esModule: true,
  SponsorContactEditor: () => <div />,
}))

vi.mock('@/components/admin/sponsor/SponsorLogoEditor', () => ({
  __esModule: true,
  SponsorLogoEditor: () => <div />,
}))

// vi.mock calls are hoisted automatically by Vitest
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'

const renderForm = (sponsor: SponsorForConferenceExpanded | null) =>
  render(
    <SponsorCRMForm
      conferenceId="conf-2026"
      sponsor={sponsor}
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )

describe('SponsorCRMForm — header primary action', () => {
  beforeEach(() => {
    submitForm = vi.fn().mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  /**
   * Regression: "Mark as Won" only staged `status` in local form state. The
   * next CTA ("Start contract") renders SponsorContractView from the PERSISTED
   * sponsor, which was still `negotiating`, so the flow dead-ended on "Move the
   * sponsor to Closed Won before sending registration".
   */
  it('saves the new stage instead of only staging it', async () => {
    renderForm(mockSponsor({ status: 'negotiating', contractStatus: 'none' }))

    fireEvent.click(screen.getByRole('button', { name: /Mark as Won/ }))

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1))
    expect(submitForm.mock.calls[0][0]).toMatchObject({
      status: 'closed-won',
    })
  })

  it('advances the CTA only after the save resolves', async () => {
    let resolveSave: () => void = () => {}
    submitForm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        }),
    )
    renderForm(mockSponsor({ status: 'negotiating', contractStatus: 'none' }))

    fireEvent.click(screen.getByRole('button', { name: /Mark as Won/ }))

    // In flight: the button reports progress and refuses a second click.
    const cta = screen.getByRole('button', { name: /Saving/ })
    expect(cta).toBeDisabled()

    resolveSave()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Start contract/ }),
      ).toBeInTheDocument(),
    )
    expect(submitForm).toHaveBeenCalledTimes(1)
  })

  it('keeps the deal where it was when the save fails', async () => {
    submitForm = vi.fn().mockRejectedValue(new Error('nope'))
    renderForm(mockSponsor({ status: 'negotiating', contractStatus: 'none' }))

    fireEvent.click(screen.getByRole('button', { name: /Mark as Won/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Mark as Won/ })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('button', { name: /Start contract/ }),
    ).not.toBeInTheDocument()
  })

  /**
   * The end of the reported flow: once the stage is persisted the sponsor prop
   * refreshes, and "Start contract" must open a contract view that agrees the
   * sponsor is won.
   */
  it('opens the contract view against a won sponsor', async () => {
    const { rerender } = renderForm(
      mockSponsor({ status: 'negotiating', contractStatus: 'none' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /Mark as Won/ }))
    await waitFor(() => expect(submitForm).toHaveBeenCalled())

    // What the host does after the mutation invalidates the list.
    rerender(
      <SponsorCRMForm
        conferenceId="conf-2026"
        sponsor={mockSponsor({ status: 'closed-won', contractStatus: 'none' })}
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Start contract/ }))

    expect(screen.getByTestId('contract-view')).toHaveTextContent(
      'persisted status: closed-won',
    )
  })

  /** A blocked step must still say what is missing rather than save. */
  it('will not save a transition the state machine blocks', async () => {
    renderForm(mockSponsor({ status: 'negotiating', tier: undefined }))

    const cta = screen.getByRole('button', { name: /Mark as Won/ })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(submitForm).not.toHaveBeenCalled()
  })

  /**
   * Regression: the CTA was computed only for a persisted sponsor, so on the
   * "Add Sponsor to Pipeline" form it vanished — reading as "no next step"
   * rather than "save this first".
   */
  it('explains itself on an unsaved sponsor instead of disappearing', async () => {
    renderForm(null)

    const cta = screen.getByRole('button', { name: /Advance to Contacted/ })
    expect(cta).toBeDisabled()
    expect(cta.parentElement).toHaveAttribute(
      'title',
      expect.stringContaining('Add this sponsor to the pipeline first'),
    )

    fireEvent.click(cta)
    expect(submitForm).not.toHaveBeenCalled()
  })
})
