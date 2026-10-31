import { createYoga, type YogaServerOptions } from 'graphql-yoga'
import { createRateLimitPlugin, type RateLimitOptions } from './rate-limit'
import { schema as defaultSchema } from './schema'

type Options = Pick<YogaServerOptions<object, object>, 'schema'> & {
  /** Omitted only in tests that do not exercise limits. */
  rateLimit?: RateLimitOptions
}

// Masked errors: unexpected throws reach the client as "Unexpected error.".
// Batching off: one operation per request, so per-operation limits hold.
// Introspection stays on (Yoga's default).
export const createApi = ({
  schema = defaultSchema,
  rateLimit,
}: Options = {}) =>
  createYoga({
    schema,
    graphqlEndpoint: '/graphql',
    maskedErrors: true,
    batching: false,
    landingPage: false,
    plugins: rateLimit ? [createRateLimitPlugin(rateLimit)] : [],
  })
