/**
 * @vitest-environment jsdom
 *
 * The sponsor page header changes the status through `moveStage`, so the
 * pipeline rules apply. A refusal is shown, and a success refreshes every
 * query the page holds (a stale record would save the old status back).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({
  options: {} as {
    onSuccess?: () => void
    onError?: (e: { message: string }) => void
  },
  mutate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        getOverview: {
          useQuery: () => ({
            data: { status: 'negotiating', sponsor: { name: 'Acme' } },
            isLoading: false,
          }),
        },
        moveStage: {
          useMutation: (options: typeof h.options) => {
            h.options = options
            return { mutate: h.mutate, isPending: false }
          },
        },
      },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: h.notify }),
}))
vi.mock('@/components/SponsorLogo', () => ({ SponsorLogo: () => null }))

import { SponsorDetailHeader } from '@/components/admin/sponsor-crm/widgets/SponsorDetailHeader'

afterEach(cleanup)

describe('SponsorDetailHeader status change', () => {
  it('moves the stage, refreshes on success and shows a refusal', () => {
    const onChanged = vi.fn()
    render(
      <SponsorDetailHeader
        sponsorId="sfc-1"
        onOpenRecord={vi.fn()}
        onChanged={onChanged}
      />,
    )

    expect(screen.queryByText('Mark as Won')).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'closed-won' },
    })
    expect(h.mutate).toHaveBeenCalledWith({
      id: 'sfc-1',
      newStatus: 'closed-won',
    })

    h.options.onSuccess?.()
    expect(onChanged).toHaveBeenCalled()

    h.options.onError?.({ message: 'A won sponsor needs a tier' })
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'A won sponsor needs a tier',
      }),
    )
  })
})
