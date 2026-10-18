/**
 * @vitest-environment node
 *
 * The worker serves the precached `/offline` page when a navigation fails, at
 * the URL that failed. For `/f/<code>` that URL IS the Feedback Code (speaker
 * feedback spec §7.1), and the fallback carries neither the `/f` response
 * header nor the page's referrer meta, so its own requests would send the
 * code as a Referer. The fallback therefore never sends one.
 *
 * Runs the REAL `public/sw.js` in a sandbox (not a source pin) and calls its
 * navigation handler with a failing network.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8')

function loadWorker(offlinePage: Response | undefined) {
  const sandbox = {
    self: { addEventListener: () => {}, registration: {}, clients: {} },
    caches: { open: async () => ({ match: async () => offlinePage }) },
    fetch: async () => {
      throw new TypeError('Failed to fetch')
    },
    Response,
    Headers,
    URL,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(
    `${source}\n;globalThis.handleNavigate = handleNavigate`,
    sandbox,
  )
  return sandbox as typeof sandbox & {
    handleNavigate: (request: Request) => Promise<Response>
  }
}

describe('service worker offline fallback', () => {
  it('never sends a referrer from the offline page, whatever URL it is shown at', async () => {
    const worker = loadWorker(
      new Response('<h1>Offline</h1>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const response = await worker.handleNavigate(
      new Request('https://2026.cloudnativedays.no/f/k7m2qx'),
    )

    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    // Still the offline page itself.
    expect(response.headers.get('Content-Type')).toBe('text/html')
    expect(await response.text()).toBe('<h1>Offline</h1>')
  })
})
