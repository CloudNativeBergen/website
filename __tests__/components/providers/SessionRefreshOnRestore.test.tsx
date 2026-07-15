/**
 * @vitest-environment jsdom
 */
import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock next-auth/react so `useSession()` returns a spy `update` we can assert on.
const update = vi.fn()
vi.mock('next-auth/react', () => ({
  useSession: () => ({ update }),
}))

import { SessionRefreshOnRestore } from '@/components/providers/SessionRefreshOnRestore'

/** Dispatch a `pageshow` event carrying a `persisted` flag (as bfcache does). */
function firePageShow(persisted: boolean) {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: persisted })
  window.dispatchEvent(event)
}

beforeEach(() => {
  update.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('SessionRefreshOnRestore', () => {
  it('renders nothing', () => {
    const { container } = render(<SessionRefreshOnRestore />)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls update() on a bfcache restore (pageshow with persisted === true)', () => {
    render(<SessionRefreshOnRestore />)

    firePageShow(true)

    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does NOT call update() on a normal load (pageshow with persisted === false)', () => {
    render(<SessionRefreshOnRestore />)

    firePageShow(false)

    expect(update).not.toHaveBeenCalled()
  })

  it('removes the pageshow listener on unmount', () => {
    const { unmount } = render(<SessionRefreshOnRestore />)

    unmount()
    firePageShow(true)

    expect(update).not.toHaveBeenCalled()
  })
})
