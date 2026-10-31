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

None yet: the health query needs no secrets. Secrets are never committed. Set
them per environment with `npx wrangler secret put <NAME> --env <env>`, and
never reuse a production value in `preview`. List each new secret here, with
the environments that need it, in the PR that adds it.
