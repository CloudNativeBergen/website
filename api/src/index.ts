import type { RateLimiter } from './rate-limit'
import { createApi } from './yoga'

export interface Env {
  /** Per-request limit, keyed on token hash or client IP plus tenant. */
  API_LIMITER: RateLimiter
  /** Tighter limit for guessable-code attempts, used via `countAttempt`. */
  CODE_ATTEMPT_LIMITER: RateLimiter
  /** Shared with the BFF to sign the client IP header. */
  CLIENT_IP_SECRET: string
}

let yoga: ReturnType<typeof createApi> | undefined

export default {
  // Bindings are fixed per isolate, so build Yoga once on first request.
  fetch(request: Request, env: Env) {
    yoga ??= createApi({
      rateLimit: {
        limiter: env.API_LIMITER,
        ipSecret: env.CLIENT_IP_SECRET,
        // Until #1786 resolves one tenant per operation, anonymous callers
        // are keyed on IP alone.
        tenant: () => null,
      },
    })
    return yoga.fetch(request, env)
  },
}
