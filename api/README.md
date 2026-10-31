# @runkonf/api

The `api.konf.app` GraphQL API (epic #1772): a Cloudflare Worker serving
`/graphql` with GraphQL Yoga and a code-first Pothos schema.

- `src/index.ts`: Worker entry
- `src/yoga.ts`: Yoga server (masked errors, no HTTP batching, introspection on)
- `src/schema/`: Pothos builder and schema root

Domain code comes from the website's `src/lib` through the `@/*` path alias
(`tsconfig.json`). Never copy it here.

## Commands

```sh
pnpm --filter @runkonf/api dev        # wrangler dev, local
pnpm --filter @runkonf/api test       # vitest (also part of root `pnpm test`)
pnpm --filter @runkonf/api typecheck  # also part of root `pnpm typecheck`
pnpm --filter @runkonf/api build      # wrangler deploy --dry-run, bundle to dist/
```

Deploy with `npx wrangler deploy --env preview` or `--env production` from
`api/`.

## Environments

| Env          | Worker             | Host                           |
| ------------ | ------------------ | ------------------------------ |
| `preview`    | `konf-api-preview` | `*.workers.dev`                |
| `production` | `konf-api`         | `api.konf.app` (custom domain) |

## Secrets

| Secret             | Envs                    | Purpose                                                                                                                                                                                                                |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLIENT_IP_SECRET` | `preview`, `production` | HMAC key shared with the BFF, which signs the client IP in `x-konf-client-ip` (`signClientIp` in `src/rate-limit`). If it is unset or wrong, anonymous callers are keyed on `cf-connecting-ip`, which is the BFF's IP. |

Secrets are never committed. Set
them per environment with `npx wrangler secret put <NAME> --env <env>`, and
never reuse a production value in `preview`. List each new secret here, with
the environments that need it, in the PR that adds it.

## Rate limiting

`src/rate-limit` (#1790), wired in `src/index.ts`:

- `API_LIMITER` (300 per minute): one hit per operation, keyed on the SHA-256
  of the bearer token, or on tenant plus client IP for anonymous callers. The
  tenant is `null` until #1786 resolves one per operation, so for now anonymous
  callers are keyed on IP alone.
- `CODE_ATTEMPT_LIMITER` (10 per minute): resolvers that check guessable codes
  call `countAttempt(ctx, env.CODE_ATTEMPT_LIMITER, '<action>')` once per
  attempt.
- Depth (max 10) and cost (max 500 fields) are checked before execution.

A denial returns `RATE_LIMITED` with HTTP 429. An oversized query returns
`QUERY_TOO_COMPLEX` with HTTP 400. Both codes pass through `maskedErrors`.
