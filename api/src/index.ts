import { WorkerEntrypoint } from 'cloudflare:workers'
import { createGateway, type Env } from './gateway'
import type { CacheProps } from './response-cache'
// Composed at build time (`pnpm compose`), imported as text (wrangler rules).
import supergraph from '../supergraph.graphql'

const gateway = createGateway(supergraph)

export default {
  fetch: (request, env, ctx) => gateway.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>

/**
 * The anonymous response cache (#1789): Workers Caching fronts this entrypoint
 * (wrangler `exports.CachedRead.cache`). Only the gateway reaches it, over
 * ctx.exports, after its guards; a named entrypoint has no public route.
 */
export class CachedRead extends WorkerEntrypoint<Env, CacheProps> {
  fetch(request: Request) {
    return gateway.cachedRead(request, this.env, this.ctx, this.ctx.props)
  }

  /** Tag purges are scoped to the entrypoint that calls them: this one. */
  async purge(tags: string[]) {
    const result = await this.ctx.cache?.purge({ tags })
    if (!result?.success) throw new Error('cache purge failed')
  }
}
