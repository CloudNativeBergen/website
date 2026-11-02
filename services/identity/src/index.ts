// Identity entry: Better Auth under /api/auth, the gateway's RPC entrypoint,
// 404 for everything else.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuth, createData, type AuthEnv } from './data'
import type { WorkerEnv } from './worker'

type Env = WorkerEnv & AuthEnv

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
    if (new URL(request.url).pathname.startsWith('/api/auth/')) {
      return createAuth(env.DB, env).handler(request)
    }
    // Only Better Auth is public. The gateway and tenant-directory use the
    // RPC entrypoints above.
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
