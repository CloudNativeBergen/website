import { createGateway, type Env } from './gateway'
// Composed at build time (`pnpm compose`), imported as text (wrangler rules).
import supergraph from '../supergraph.graphql'

const gateway = createGateway(supergraph)

export default {
  fetch: (request, env, ctx) => gateway.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>
