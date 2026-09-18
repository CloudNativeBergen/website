/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
const h = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  plan: vi.fn(),
  report: vi.fn(),
  campaign: vi.fn(),
  social: vi.fn(),
  success: undefined as undefined | (() => void),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      marketing: {
        plan: { get: { invalidate: h.plan } },
        report: { invalidate: h.report },
        campaign: { invalidate: h.campaign },
      },
      social: { listVariants: { invalidate: h.social } },
    }),
    marketing: {
      plan: {
        deletionPreview: { useQuery: h.query },
        delete: {
          useMutation: ({ onSuccess }: { onSuccess: () => void }) => {
            h.success = onSuccess
            return { mutate: h.mutate, isPending: false }
          },
        },
      },
    },
  },
}))
import { DeletePlanSection } from './DeletePlanSection'
const preview = {
  campaigns: 4,
  tasks: 20,
  publishedTasks: 2,
  snapshots: 50,
  requiresTypedConfirmation: true,
  conferenceTitle: 'My Conference',
}
beforeEach(() => {
  vi.clearAllMocks()
  h.query.mockReturnValue({ data: preview, isFetching: false })
})
afterEach(cleanup)
describe('plan deletion settings', () => {
  it('reads counts only when opened and sends the exact title after matching', () => {
    render(<DeletePlanSection />)
    expect(h.query).toHaveBeenCalledTimes(0)
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    expect(h.query).toHaveBeenCalledWith(undefined, {
      refetchOnWindowFocus: false,
    })
    expect(
      screen.getByText('4 Campaigns and 20 Tasks permanently deleted'),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Type “My Conference” to confirm'), {
      target: { value: ' My Conference ' },
    })
    const buttons = screen.getAllByRole('button', { name: 'Delete plan' })
    fireEvent.click(buttons.at(-1)!)
    expect(h.mutate).toHaveBeenCalledWith({ confirmTitle: 'My Conference' })
  })
  it('allows an unpublished plan without typing and returns to the plan home after deletion', () => {
    h.query.mockReturnValue({
      data: { ...preview, publishedTasks: 0, requiresTypedConfirmation: false },
      isFetching: false,
    })
    render(<DeletePlanSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete plan' }).at(-1)!,
    )
    expect(h.mutate).toHaveBeenCalledWith({ confirmTitle: '' })
    act(() => h.success?.())
    expect(h.push).toHaveBeenCalledWith('/admin/marketing')
    // Including the Social Posts list: deleting removes unpublished
    // task-owned posts and variants, so it would otherwise keep showing drafts
    // that no longer exist until its next poll.
    expect([
      h.plan.mock.calls.length,
      h.report.mock.calls.length,
      h.campaign.mock.calls.length,
      h.social.mock.calls.length,
    ]).toEqual([1, 1, 1, 1])
  })
  it('holds confirmation while a fresh preview is fetched even if cached counts exist', () => {
    h.query.mockReturnValue({
      data: { ...preview, requiresTypedConfirmation: false },
      isFetching: true,
    })
    render(<DeletePlanSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    expect(
      screen.getByText('Checking Campaigns, Tasks and publications…'),
    ).toBeVisible()
    expect(
      screen.getAllByRole('button', { name: 'Delete plan' }).at(-1),
    ).toBeDisabled()
  })
  it('presents the publishing refusal before offering deletion', () => {
    h.query.mockReturnValue({
      error: {
        message:
          'The post is being published right now. Try again in a minute.',
      },
    })
    render(<DeletePlanSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete plan' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'The post is being published right now. Try again in a minute.',
    )
    expect(
      screen.getAllByRole('button', { name: 'Delete plan' }).at(-1),
    ).toBeDisabled()
  })
})
