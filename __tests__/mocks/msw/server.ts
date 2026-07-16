import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * MSW node server for HTTP interception in vitest. Started once in
 * vitest.setup.ts. Tests add per-case behaviour with `server.use(...)` and the
 * global `afterEach` resets to the default handlers, so overrides never leak
 * between tests.
 */
export const server = setupServer(...handlers)
