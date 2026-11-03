// Identity entry: Better Auth under /api/auth, the login handoff under
// /handoff, its error page at /error, the RPC entrypoints, and 404 for everything else.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuth, createData } from './data'
import { errorPage } from './error-page'
import { handoff, type HandoffEnv } from './handoff'
import { loginTestPage } from './login-test'
import type { WorkerEnv } from './worker'

/** LOGIN_TEST_PAGE: "1" on preview only (service.cue) serves GET /test. */
type Env = WorkerEnv & HandoffEnv & { LOGIN_TEST_PAGE?: string }

/**
 * RPC for the gateway, reachable only over a service binding with
 * `"entrypoint": "Membership"`; it has no HTTP route.
 */
export class Membership extends WorkerEntrypoint<Env> {
  principal(userId: string, orgId: string) {
    return createData(this.env).principal(userId, orgId)
  }
}

/**
 * RPC for tenant-directory (`"entrypoint": "Organizations"`), which owns org
 * ids. No HTTP route.
 */
export class Organizations extends WorkerEntrypoint<Env> {
  ensure(id: string, slug: string) {
    return createData(this.env).ensureOrganization(id, slug)
  }
}

export default {
  fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/auth/')) {
      return createAuth(env.DB, env).handler(request)
    }
    if (pathname === '/handoff' || pathname.startsWith('/handoff/')) {
      return handoff(request, env)
    }
    if (pathname === '/error') return errorPage(request, env)
    if (
      pathname === '/test' &&
      request.method === 'GET' &&
      env.LOGIN_TEST_PAGE === '1'
    ) {
      return loginTestPage()
    }
    // Only Better Auth, the login handoff, its error page and the preview test page are public. The gateway and tenant-directory use the
    // RPC entrypoints above.
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
