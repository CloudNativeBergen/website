import '@testing-library/jest-dom/vitest'
import dotenv from 'dotenv'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './__tests__/mocks/msw/server'

dotenv.config({ path: ['.env', '.env.local', '.env.test'] })

process.env.INVITATION_TOKEN_SECRET ??= 'test-invitation-token-secret'

// Per-tenant env credentials (`TENANT_<SLUG>_CHECKIN_*`, RunKonf/platform#57)
// turn the env-per-org secret store from a no-op into a live slug lookup, and
// most suites mock `@/lib/organization/sanity` without the slug reads. A
// developer shell carrying such a variable would flip those suites. Tests that
// need one stub it explicitly with `vi.stubEnv`.
//
// WorkOS configuration never comes from the developer's shell or a `.env`
// file in tests either. The AuthKit SDK captures these at import and several
// change outcomes loudly (`WORKOS_COOKIE_DOMAIN`, `WORKOS_COOKIE_NAME`) or
// quietly (`WORKOS_CLAIM_TOKEN` makes it POST to WorkOS for real). Suites that
// run the SDK set what they need through `__tests__/helpers/workosEnv.ts`.
for (const name of Object.keys(process.env)) {
  if (
    name.startsWith('TENANT_') ||
    name.startsWith('WORKOS_') ||
    name.startsWith('NEXT_PUBLIC_WORKOS_')
  ) {
    delete process.env[name]
  }
}

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
