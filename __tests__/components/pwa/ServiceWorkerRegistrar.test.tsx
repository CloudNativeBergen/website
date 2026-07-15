/**
 * @vitest-environment jsdom
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'

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
      await screen.findByRole('dialog', { name: 'Update available' }),
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
      screen.queryByRole('dialog', { name: 'Update available' }),
    ).not.toBeInTheDocument()
  })

  it('posts SKIP_WAITING to the waiting worker when Reload is clicked', async () => {
    const registration = await renderAndRegister()

    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')

    await screen.findByRole('dialog', { name: 'Update available' })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    // Clicking Reload must NOT itself reload — the controllerchange does.
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('reloads exactly once on controllerchange AFTER the user accepts (guard prevents a second)', async () => {
    const registration = await renderAndRegister()

    // User accepts the update.
    container.controller = {}
    const worker = new FakeWorker()
    registration.installing = worker
    registration.dispatch('updatefound')
    worker.setState('installed')
    await screen.findByRole('dialog', { name: 'Update available' })
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

    await screen.findByRole('dialog', { name: 'Update available' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss update prompt' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Update available' }),
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
