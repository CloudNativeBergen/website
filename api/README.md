# @runkonf/api

The `api.konf.app` GraphQL gateway (epic #1772): Hive Gateway on a Cloudflare
Worker, serving `/graphql` from a supergraph composed at build time. Subgraphs
are reached over service bindings, never HTTP.

- `src/index.ts`: Worker entry
- `src/gateway.ts`: per request, drops any client envelope, resolves the tenant
  from `Origin` (tenant-directory, anonymous rules), verifies the bearer
  identity JWT against identity's JWKS, looks up `orgRole` live (identity
  `Membership`), and mints one 60-second envelope for the subgraphs. Masked
  errors, no HTTP batching, depth and cost limits.
- `src/supergraph.ts`: composes the subgraph schemas; `pnpm compose` writes
  `supergraph.graphql` (not committed; `dev` and `build` run it)

Domain code comes from the website's `src/lib` through the `@/*` path alias
(`tsconfig.json`). Never copy it here.

## Commands

```sh
pnpm --filter @runkonf/api dev        # wrangler dev, local
pnpm --filter @runkonf/api test       # vitest (also part of root `pnpm test`)
pnpm --filter @runkonf/api typecheck  # also part of root `pnpm typecheck`
pnpm --filter @runkonf/api compose    # write supergraph.graphql
pnpm --filter @runkonf/api build      # compose, then wrangler deploy --dry-run to dist/
```

Run `pnpm compose` first, then deploy with `npx wrangler deploy --env preview` or `--env production` from
`api/`.

## Environments

| Env          | Worker             | Host                           |
| ------------ | ------------------ | ------------------------------ |
| `preview`    | `konf-api-preview` | `*.workers.dev`                |
| `production` | `konf-api`         | `api.konf.app` (custom domain) |

## Secrets

| Secret                 | Envs                | What                                   |
| ---------------------- | ------------------- | -------------------------------------- |
| `ENVELOPE_PRIVATE_KEY` | preview, production | PKCS8 PEM (EdDSA) that signs envelopes |

Subgraphs get the matching public key as `GATEWAY_PUBLIC_KEY`. Secrets are never committed. Set
them per environment with `npx wrangler secret put <NAME> --env <env>`, and
never reuse a production value in `preview`. List each new secret here, with
the environments that need it, in the PR that adds it.
