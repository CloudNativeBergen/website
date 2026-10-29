/**
 * @vitest-environment jsdom
 *
 * A toast's dismiss timer must not outlive the provider. One that fires after
 * the page (or a test's jsdom) is gone sets state on a dead tree; in CI that
 * surfaced as "ReferenceError: window is not defined" after the last test in
 * a file had passed, which fails the run.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NotificationProvider, useNotification } from './NotificationProvider'

function ShowsAToast() {
  const { showNotification } = useNotification()
  return (
    <button
      onClick={() => showNotification({ type: 'success', title: 'Saved' })}
    >
      Save
    </button>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

it('clears the pending dismiss timer when it unmounts', () => {
  vi.useFakeTimers()
  const { unmount } = render(
    <NotificationProvider>
      <ShowsAToast />
    </NotificationProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(vi.getTimerCount()).toBeGreaterThan(0)

  act(() => unmount())

  expect(vi.getTimerCount()).toBe(0)
})
