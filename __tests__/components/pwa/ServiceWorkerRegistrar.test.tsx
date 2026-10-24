/**
 * @vitest-environment jsdom
 */
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The registrar reads the browser's path at mount to tell the Photo Wall's
// Screen Mode apart; every other test here runs on an ordinary page.
const h = {
  // `window.location` is replaced below by a plain copy (for `reload`), so
  // the path is set on whatever object the registrar will read.
  set pathname(path: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: path },
    })
  },
}

import {
  SCREEN_UPDATE_CHECK_MS,
  ServiceWorkerRegistrar,
} from '@/components/pwa/ServiceWorkerRegistrar'
import {
  SCREEN_PROBE_TIMEOUT_MS,
  SCREEN_UPDATE_RETRY_MS,
  markScreenMode,
} from '@/components/pwa/screen-update'

/** Minimal event-emitter shared by the service-worker mocks. */
class Emitter {
  private listeners: Record<string, Array<(e: unknown) => void>> = {}
  addEventListener(type: string, cb: (e: unknown) => void) {
    ;(this.listeners[type] ??= []).push(cb)
  }
  removeEventListener(type: string, cb: (e: unknown) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb)
  }
  dispatch(type: string, event: unknown = {}) {
    for (const cb of this.listeners[type] ?? []) cb(event)
  }
}

class FakeWorker extends Emitter {
  state: 'installing' | 'installed' | 'activated' = 'installing'
  postMessage = vi.fn()
  setState(state: FakeWorker['state']) {
    this.state = state
    this.dispatch('statechange')
  }
}

class FakeRegistration extends Emitter {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  update = vi.fn().mockResolvedValue(undefined)
}

class FakeSWContainer extends Emitter {
  controller: object | null = null
  registration = new FakeRegistration()
  register = vi.fn().mockImplementation(async () => this.registration)
}

let container: FakeSWContainer
let reloadMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  h.pathname = '/'

  container = new FakeSWContainer()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })

  reloadMock = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadMock },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Render, then wait for the async `register()` call to settle. */
async function renderAndRegister() {
  render(<ServiceWorkerRegistrar />)
  await waitFor(() => expect(container.register).toHaveBeenCalledTimes(1))
  return container.registration
}

describe('ServiceWorkerRegistrar', () => {
  it('registers /sw.js with updateViaCache: none', async () => {
    await renderAndRegister()
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      updateViaCache: 'none',
    })
  })

  it('shows the update banner on updatefound → installed WITH an existing controller', async () => {
    const registration = await renderAndRegister()

    // An existing controller means the page is already controlled ⇒ UPDATE.
    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    expect(
      await screen.findByRole('status', { name: 'Update available' }),
    ).toBeInTheDocument()
  })

  it('does NOT show the banner on the first install (no controller yet)', async () => {
    const registration = await renderAndRegister()

    // No controller ⇒ this is the first install, not an update.
    container.controller = null
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    expect(
      screen.queryByRole('status', { name: 'Update available' }),
    ).not.toBeInTheDocument()
  })

  it('posts SKIP_WAITING and enters the pending state when Reload is clicked', async () => {
    const registration = await renderAndRegister()

    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    await screen.findByRole('status', { name: 'Update available' })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    // Clicking Reload must NOT itself reload — the controllerchange does.
    expect(reloadMock).not.toHaveBeenCalled()

    // The banner now shows in-progress feedback: the action becomes a disabled
    // "Updating…" control so the user can tell the swap is underway.
    const updatingButton = screen.getByRole('button', { name: /updating/i })
    expect(updatingButton).toBeDisabled()
    expect(updatingButton).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('button', { name: 'Dismiss update prompt' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Reload' }),
    ).not.toBeInTheDocument()
  })

  it('ignores a second Reload click while the swap is already in progress', async () => {
    const registration = await renderAndRegister()

    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    await screen.findByRole('status', { name: 'Update available' })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    // The action is now the disabled "Updating…" control; clicking it again must
    // not post SKIP_WAITING (nor arm a second fallback) a second time.
    fireEvent.click(screen.getByRole('button', { name: /updating/i }))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })

  it('re-arms the banner when a reload is canceled (beforeunload) instead of hanging', async () => {
    vi.useFakeTimers()
    try {
      const registration = container.registration
      render(<ServiceWorkerRegistrar />)
      await act(async () => {
        await Promise.resolve()
      })

      act(() => {
        container.controller = {}
        const worker = new FakeWorker()
        registration.installing = worker
        registration.dispatch('updatefound')
        worker.setState('installed')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
      // controllerchange calls reload(); the mock does NOT navigate, standing in
      // for a beforeunload prompt (e.g. unsaved schedule edits) the user cancels.
      act(() => container.dispatch('controllerchange'))
      expect(reloadMock).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled()

      // After the recovery delay the banner returns to its actionable state
      // rather than hanging on a dead spinner.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled()
      expect(
        screen.queryByRole('button', { name: /updating/i }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fallback timeout forces a reload when controllerchange never fires', async () => {
    vi.useFakeTimers()
    try {
      const registration = container.registration
      render(<ServiceWorkerRegistrar />)
      // Flush the async register() promise + effects (microtasks aren't faked).
      await act(async () => {
        await Promise.resolve()
      })
      expect(container.register).toHaveBeenCalledTimes(1)

      act(() => {
        container.controller = {}
        const worker = new FakeWorker()
        registration.installing = worker
        registration.dispatch('updatefound')
        worker.setState('installed')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
      // controllerchange never arrives — the ~4s fallback must reload anyway.
      expect(reloadMock).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(4000)
      })

      expect(reloadMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reloads exactly once when both controllerchange and the fallback would fire', async () => {
    vi.useFakeTimers()
    try {
      const registration = container.registration
      render(<ServiceWorkerRegistrar />)
      await act(async () => {
        await Promise.resolve()
      })

      act(() => {
        container.controller = {}
        const worker = new FakeWorker()
        registration.installing = worker
        registration.dispatch('updatefound')
        worker.setState('installed')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

      // controllerchange fires first and reloads...
      act(() => container.dispatch('controllerchange'))
      // ...so advancing past the fallback window must NOT reload a second time.
      act(() => {
        vi.advanceTimersByTime(4000)
      })

      expect(reloadMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reloads exactly once on controllerchange AFTER the user accepts (guard prevents a second)', async () => {
    const registration = await renderAndRegister()

    // User accepts the update.
    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')
    await screen.findByRole('status', { name: 'Update available' })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    container.dispatch('controllerchange')
    container.dispatch('controllerchange')
    container.dispatch('controllerchange')

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT reload on a first-install controllerchange (no user action)', async () => {
    // On first install the new worker's clients.claim() fires controllerchange
    // with no prior Reload click — this must NOT reload the page.
    await renderAndRegister()

    container.dispatch('controllerchange')
    container.dispatch('controllerchange')

    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('dismissing the banner hides it without reloading', async () => {
    const registration = await renderAndRegister()

    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    await screen.findByRole('status', { name: 'Update available' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss update prompt' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Update available' }),
      ).not.toBeInTheDocument(),
    )
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('calls registration.update() on visibilitychange when visible', async () => {
    const registration = await renderAndRegister()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    fireEvent(document, new Event('visibilitychange'))

    await waitFor(() => expect(registration.update).toHaveBeenCalled())
  })
})

/**
 * The Photo Wall's Screen Mode (Photo Wall spec §9.2, §14): a venue screen
 * gets no click, no focus and no visibility change, so the registrar checks
 * for updates on a timer and accepts one by itself.
 */
describe('ServiceWorkerRegistrar on /wall/screen', () => {
  /** The screen's own URL, asked for before an update reloads it. */
  let screenAnswers = true
  const headFetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (!screenAnswers) throw new TypeError('Failed to fetch')
    return new Response(null, { status: 200 })
  })
  beforeEach(() => {
    h.pathname = '/wall/screen'
    vi.useFakeTimers()
    screenAnswers = true
    headFetch.mockClear()
    vi.stubGlobal('fetch', headFetch)
    window.sessionStorage.clear()
    markScreenMode(null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** Render and flush the async register() (microtasks are not faked). */
  async function renderScreen() {
    const before = container.register.mock.calls.length
    render(<ServiceWorkerRegistrar />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(container.register).toHaveBeenCalledTimes(before + 1)
    return container.registration
  }
  const wait = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  it('takes no update while the screen URL does not answer, and takes it once it does', async () => {
    screenAnswers = false
    // First an error page (a deploy in progress), then no network at all.
    headFetch.mockResolvedValueOnce(new Response(null, { status: 503 }))
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.controller = {}
    container.registration.waiting = waiting
    await renderScreen()
    expect(headFetch).toHaveBeenCalledWith(
      window.location.href,
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    )
    // A reload now would land on the offline page: wait.
    expect(waiting.postMessage).not.toHaveBeenCalled()
    await wait(SCREEN_UPDATE_RETRY_MS)
    expect(headFetch).toHaveBeenCalledTimes(2)
    expect(waiting.postMessage).not.toHaveBeenCalled()
    screenAnswers = true
    await wait(2 * SCREEN_UPDATE_RETRY_MS)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('gives up a probe that never answers and tries again after the wait', async () => {
    // A stalled connection: the request is taken and never answered.
    headFetch.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.controller = {}
    container.registration.waiting = waiting
    await renderScreen()
    expect(headFetch).toHaveBeenCalledTimes(1)
    await wait(SCREEN_PROBE_TIMEOUT_MS)
    expect(headFetch.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(waiting.postMessage).not.toHaveBeenCalled()
    // Counted as a failed attempt: the next probe after the backoff answers.
    await wait(SCREEN_UPDATE_RETRY_MS)
    expect(headFetch).toHaveBeenCalledTimes(2)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('a client-side navigation into Screen Mode starts the checks and takes updates by itself', async () => {
    h.pathname = '/program'
    const registration = await renderScreen()
    await wait(SCREEN_UPDATE_CHECK_MS)
    expect(registration.update).not.toHaveBeenCalled()
    // The screen page mounts after a client-side navigation.
    act(() => {
      h.pathname = '/wall/screen'
      markScreenMode(true)
    })
    await wait(SCREEN_UPDATE_CHECK_MS)
    expect(registration.update).toHaveBeenCalledTimes(1)
    const worker = new FakeWorker()
    act(() => {
      container.controller = {}
      registration.installing = worker
      registration.dispatch('updatefound')
      worker.setState('installed')
    })
    await wait(0)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a client-side navigation out of Screen Mode stops the checks and shows the banner again', async () => {
    const registration = await renderScreen()
    act(() => {
      h.pathname = '/program'
      markScreenMode(false)
    })
    await wait(3 * SCREEN_UPDATE_CHECK_MS)
    expect(registration.update).not.toHaveBeenCalled()
    const worker = new FakeWorker()
    act(() => {
      container.controller = {}
      registration.installing = worker
      registration.dispatch('updatefound')
      worker.setState('installed')
    })
    await wait(0)
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(
      screen.getByRole('status', { name: 'Update available' }),
    ).toBeInTheDocument()
  })

  it('backs off a worker that stays waiting across reloads instead of reloading every few seconds', async () => {
    // A wedged worker: SKIP_WAITING never activates it.
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.controller = {}
    container.registration.waiting = waiting
    await renderScreen()
    expect(waiting.postMessage).toHaveBeenCalledTimes(1)
    await wait(4000)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    // The reloaded screen finds the same worker still waiting.
    cleanup()
    await renderScreen()
    await wait(10_000)
    expect(waiting.postMessage).toHaveBeenCalledTimes(1)
    expect(reloadMock).toHaveBeenCalledTimes(1)
    await wait(SCREEN_UPDATE_RETRY_MS - 4000 - 10_000)
    expect(waiting.postMessage).toHaveBeenCalledTimes(2)
    await wait(4000)
    expect(reloadMock).toHaveBeenCalledTimes(2)
    // And twice as long before the third.
    cleanup()
    await renderScreen()
    await wait(2 * SCREEN_UPDATE_RETRY_MS - 4000 - 1)
    expect(waiting.postMessage).toHaveBeenCalledTimes(2)
    await wait(1)
    expect(waiting.postMessage).toHaveBeenCalledTimes(3)
  })

  it('finds and accepts an update untouched: a check every 10 minutes, SKIP_WAITING, then one reload', async () => {
    const registration = await renderScreen()
    // Nothing happens on the screen: no focus, no visibilitychange, no click.
    expect(registration.update).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(SCREEN_UPDATE_CHECK_MS - 1)
    })
    expect(registration.update).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(registration.update).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(SCREEN_UPDATE_CHECK_MS)
    })
    expect(registration.update).toHaveBeenCalledTimes(2)

    // The check found a new worker, which installs behind an existing controller.
    const worker = new FakeWorker()
    act(() => {
      container.controller = {}
      registration.installing = worker
      registration.dispatch('updatefound')
      worker.setState('installed')
    })
    // Once the screen's URL has answered...
    await wait(0)
    // ...accepted without a click, and no banner to click.
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reloadMock).not.toHaveBeenCalled()
    act(() => container.dispatch('controllerchange'))
    expect(reloadMock).toHaveBeenCalledTimes(1)
    // The fallback must not reload a second time.
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('takes a worker already waiting when the screen opens', async () => {
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.controller = {}
    container.registration.waiting = waiting
    await renderScreen()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not reload on a first install: no controller means no update', async () => {
    const registration = await renderScreen()
    const worker = new FakeWorker()
    act(() => {
      container.controller = null
      registration.installing = worker
      registration.dispatch('updatefound')
      worker.setState('installed')
    })
    expect(worker.postMessage).not.toHaveBeenCalled()
    act(() => container.dispatch('controllerchange'))
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('an ordinary page keeps the banner and runs no timer', async () => {
    h.pathname = '/program'
    const registration = await renderScreen()
    await act(async () => {
      vi.advanceTimersByTime(3 * SCREEN_UPDATE_CHECK_MS)
    })
    expect(registration.update).not.toHaveBeenCalled()
    const worker = new FakeWorker()
    act(() => {
      container.controller = {}
      registration.installing = worker
      registration.dispatch('updatefound')
      worker.setState('installed')
    })
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(
      screen.getByRole('status', { name: 'Update available' }),
    ).toBeInTheDocument()
  })
})
