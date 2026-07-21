/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { StandaloneLaunchRedirect } from './StandaloneLaunchRedirect'

const LAUNCH_REDIRECT_HANDLED_KEY = 'cndn:launch-redirect-handled'

const replace = vi.fn()

/** Point `window.location` at a mock with a `replace` spy and the given path. */
function setLocation(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname, replace },
    configurable: true,
    writable: true,
  })
}

/** Install a `matchMedia` whose `(display-mode: standalone)` matches `standalone`. */
function setStandaloneDisplayMode(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: query === '(display-mode: standalone)' ? standalone : false,
      media: query,
    }),
    configurable: true,
    writable: true,
  })
}

/** Set the legacy iOS `navigator.standalone` flag. */
function setNavigatorStandalone(standalone: boolean) {
  Object.defineProperty(window.navigator, 'standalone', {
    value: standalone,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  setStandaloneDisplayMode(false)
  setNavigatorStandalone(false)
  setLocation('/')
})

afterEach(() => {
  cleanup()
})

describe('StandaloneLaunchRedirect', () => {
  it('renders nothing', () => {
    const { container } = render(<StandaloneLaunchRedirect />)
    expect(container).toBeEmptyDOMElement()
  })

  it('redirects to /launch when standalone, on `/`, and the session is fresh', () => {
    setStandaloneDisplayMode(true)
    setLocation('/')
    render(<StandaloneLaunchRedirect />)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/launch')
    // The launch is now marked handled for the rest of the session.
    expect(
      window.sessionStorage.getItem(LAUNCH_REDIRECT_HANDLED_KEY),
    ).not.toBeNull()
  })

  it('honors the legacy navigator.standalone flag', () => {
    setStandaloneDisplayMode(false)
    setNavigatorStandalone(true)
    setLocation('/')
    render(<StandaloneLaunchRedirect />)
    expect(replace).toHaveBeenCalledWith('/launch')
  })

  it('does NOT redirect when the session guard is already set', () => {
    window.sessionStorage.setItem(LAUNCH_REDIRECT_HANDLED_KEY, '1')
    setStandaloneDisplayMode(true)
    setLocation('/')
    render(<StandaloneLaunchRedirect />)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does NOT redirect a normal (non-standalone) browser visitor', () => {
    setStandaloneDisplayMode(false)
    setNavigatorStandalone(false)
    setLocation('/')
    render(<StandaloneLaunchRedirect />)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does NOT redirect a deep launch (pathname other than `/`)', () => {
    setStandaloneDisplayMode(true)
    setLocation('/admin')
    render(<StandaloneLaunchRedirect />)
    expect(replace).not.toHaveBeenCalled()
  })
})
