// Identity entry: Better Auth under /api/auth, the gateway's RPC entrypoint,
// everything else to the generated subgraph worker.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { createAuth, createData, type AuthEnv } from './data'
import subgraph, { type WorkerEnv } from './worker'

type Env = WorkerEnv & AuthEnv

/**
 * RPC for the gateway, reachable only over a service binding with
 * `"entrypoint": "Membership"`; it has no HTTP route.
 */
export class Membership extends WorkerEntrypoint<Env> {
  principal(userId: string, orgId: string) {
    return createData(this.env.DB).principal(userId, orgId)
  }
}

export default {
  fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith('/api/auth/')) {
      return createAuth(env.DB, env).handler(request)
    }
    return subgraph.fetch(request, env)
  },
} satisfies ExportedHandler<Env>
