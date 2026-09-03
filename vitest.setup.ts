import '@testing-library/jest-dom/vitest'
import dotenv from 'dotenv'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './__tests__/mocks/msw/server'

dotenv.config({ path: ['.env', '.env.local', '.env.test'] })

process.env.INVITATION_TOKEN_SECRET ??= 'test-invitation-token-secret'

// MSW node server for HTTP interception (GitHub /user/emails, Checkin.no
// GraphQL, …). `onUnhandledRequest: 'bypass'` so the many existing tests that
// make no outbound requests are unaffected — only the explicitly-handled hosts
// are intercepted. `resetHandlers` clears any per-test `server.use(...)`.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// jsdom ships neither observer. Headless UI reaches for ResizeObserver the
// moment a Menu opens, and the failure is a silently exit-1 unhandled error
// rather than a failing assertion — every test still reports green. Stub both
// here so no suite has to remember, and so a test that opens a dropdown does
// not turn the whole run red without saying which one.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver
globalThis.IntersectionObserver ??=
  NoopObserver as unknown as typeof IntersectionObserver

const originalWarn = console.warn
console.warn = (msg, ...args) => {
  if (
    typeof msg === 'string' &&
    msg.includes('Using EdDSA algorithm for JWT signing')
  )
    return
  originalWarn(msg, ...args)
}
