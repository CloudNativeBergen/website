// Identity entry: Better Auth under /api/auth, the login handoff under
// /handoff, its error page at /error, the linked-accounts page at /account, the RPC entrypoints, and 404 for everything else.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuth, createData } from './data'
import { accountPage } from './account-page'
import { errorPage } from './error-page'
import { handoff, type HandoffEnv } from './handoff'
import { loginTestPage } from './login-test'
import { orgWriteGate } from './org-write-gate'
import graph, { type WorkerEnv } from './worker'

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
 * The identity subgraph (membership mutations, #1923) for the gateway, over a
 * service binding with `"entrypoint": "Graph"`. Not on the public host: the
 * default fetch below 404s /graphql.
 */
export class Graph extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return graph.fetch(request, this.env)
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

  /**
   * Organizer membership sync (#1907), run hourly by tenant-directory's cron.
   * No arguments: the caller cannot widen what it grants. The gateway binds
   * `Membership`, not this class, so it cannot trigger a sync.
   */
  syncMembers() {
    return createData(this.env).syncMembers()
  }
}

export default {
  fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/auth/')) {
      return orgWriteGate(request) ?? createAuth(env.DB, env).handler(request)
    }
    if (pathname === '/handoff' || pathname.startsWith('/handoff/')) {
      return handoff(request, env)
    }
    if (pathname === '/error') return errorPage(request, env)
    if (pathname === '/account' && request.method === 'GET') {
      return accountPage(request, env)
    }
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
