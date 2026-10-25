/**
 * @vitest-environment jsdom
 *
 * The Content judgement switch keeps keyboard focus across a save and the
 * refresh that follows, and follows the stored value when another organizer
 * changes it. The tRPC mutation is the boundary; React and the DOM are real.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  options: null as null | {
    onSuccess?: (data: unknown, vars: { enabled: boolean }) => void
    onError?: (error: Error, vars: { enabled: boolean }) => void
  },
  isPending: false,
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    organization: {
      updateContentJudgement: {
        useMutation: (options: typeof m.options) => {
          m.options = options
          return { mutate: m.mutate, isPending: m.isPending }
        },
      },
    },
  },
}))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { ContentJudgementSettings } from './ContentJudgementSettings'

const card = (props: Parameters<typeof ContentJudgementSettings>[0]) => (
  <NotificationProvider>
    <ContentJudgementSettings {...props} />
  </NotificationProvider>
)

beforeEach(() => {
  m.mutate.mockReset()
  m.isPending = false
  refresh.mockReset()
})

describe('ContentJudgementSettings', () => {
  it('keeps focus on the switch through the save and the refreshed props', () => {
    const { rerender } = render(card({ enabled: false }))
    const toggle = screen.getByRole('switch', { name: 'Judge content' })
    toggle.focus()
    // Space on a focused button is a click.
    fireEvent.click(toggle)
    expect(m.mutate).toHaveBeenCalledWith({ enabled: true })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Saving: the switch stays focusable (aria-disabled, not disabled).
    m.isPending = true
    rerender(card({ enabled: false }))
    // jsdom does not blur a control that turns `disabled` (browsers do), so
    // the attribute itself is pinned: marked busy, never disabled.
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(toggle).toBeEnabled()
    expect(document.activeElement).toBe(toggle)
    expect(screen.getByText('Saving…')).toBeInTheDocument()

    // Saved, then router.refresh() brings the new stored props.
    m.isPending = false
    act(() => m.options?.onSuccess?.({ success: true }, { enabled: true }))
    expect(refresh).toHaveBeenCalled()
    rerender(
      card({
        enabled: true,
        changedAt: '2026-10-25T12:00:00Z',
        changedByName: 'Kari Nordmann',
      }),
    )
    // The same element, still focused: no remount.
    expect(screen.getByRole('switch', { name: 'Judge content' })).toBe(toggle)
    expect(document.activeElement).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument()
    expect(screen.queryByText('Saving…')).toBeNull()
  })

  it('follows the stored value when another organizer changes it', () => {
    const { rerender } = render(card({ enabled: false }))
    const toggle = screen.getByRole('switch', { name: 'Judge content' })
    rerender(
      card({
        enabled: true,
        changedAt: '2026-10-25T12:00:00Z',
        changedByName: 'B',
      }),
    )
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    rerender(
      card({
        enabled: false,
        changedAt: '2026-10-25T12:05:00Z',
        changedByName: 'C',
      }),
    )
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('a newer change by another organizer wins over our optimistic value', () => {
    // On. We turn it off; before our refresh lands, B turns it back on. The
    // refreshed value equals the one we started from, but it is a NEWER
    // revision, so the switch must show B's on.
    const start = { enabled: true, changedAt: '2026-10-25T11:00:00Z' }
    const { rerender } = render(card(start))
    const toggle = screen.getByRole('switch', { name: 'Judge content' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    act(() => m.options?.onSuccess?.({ success: true }, { enabled: false }))
    rerender(
      card({
        enabled: true,
        changedAt: '2026-10-25T11:01:00Z',
        changedByName: 'B',
      }),
    )
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('a click while saving sends nothing more', () => {
    m.isPending = true
    render(card({ enabled: false }))
    fireEvent.click(screen.getByRole('switch', { name: 'Judge content' }))
    expect(m.mutate).not.toHaveBeenCalled()
  })

  it('a refused save returns to the STORED value, even if it changed meanwhile', () => {
    const { rerender } = render(card({ enabled: false }))
    const toggle = screen.getByRole('switch', { name: 'Judge content' })
    fireEvent.click(toggle) // our save: on
    // Meanwhile a refresh brings another organizer's change: on.
    rerender(
      card({
        enabled: true,
        changedAt: '2026-10-25T12:00:00Z',
        changedByName: 'B',
      }),
    )
    // Our save is then refused; on is what is stored, so on it stays.
    act(() => m.options?.onError?.(new Error('no'), { enabled: true }))
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('a refused save puts the switch back', () => {
    render(card({ enabled: false }))
    const toggle = screen.getByRole('switch', { name: 'Judge content' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    act(() => m.options?.onError?.(new Error('no'), { enabled: true }))
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    // And the stored state is read again: the write may have committed.
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
