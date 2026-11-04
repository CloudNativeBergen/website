# @runkonf/api

The `api.konf.app` GraphQL gateway (epic #1772): Hive Gateway on a Cloudflare
Worker, serving `/graphql` from a supergraph composed at build time. Subgraphs
are reached over service bindings, never HTTP.

- `src/index.ts`: Worker entry
- `src/gateway.ts`: per request, drops any client envelope, resolves the tenant
  from `Origin` (tenant-directory, anonymous rules), verifies the bearer
  identity JWT against identity's JWKS, looks up `orgRole` live (identity
  `Membership`), and mints one 60-second envelope for the subgraphs. Masked
  errors, no HTTP batching, depth and alias limits at validation, and a cost
  limit on each subgraph request.
  Rate limit (`API_LIMITER`, 300 requests a minute) per caller: `user:<sub>`
  from the verified JWT, else `anon:<orgId>:<ip>`, checked before identity and
  `Membership` work, after a coarse `ip:<ip>` pre-check (`API_IP_LIMITER`,
  1200 a minute) before the tenant lookup. 429 `RATE_LIMITED` when spent.
- `src/client-ip.ts`: the client IP, from the site's HMAC-signed
  `x-konf-client-ip` header (`CLIENT_IP_SECRET`) or `CF-Connecting-IP`
- `src/supergraph.ts`: composes the public contract of the subgraph schemas
  (no `@tag(internal)`, no unreachable types); `pnpm compose` writes
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

| Secret                 | Envs                | What                                                            |
| ---------------------- | ------------------- | --------------------------------------------------------------- |
| `ENVELOPE_PRIVATE_KEY` | preview, production | PKCS8 PEM (EdDSA) that signs envelopes                          |
| `SITE_PUBLIC_KEYS`     | preview, production | JSON `{ "<kid>": "<SPKI PEM>" }` of the site's server-lane keys |
| `CLIENT_IP_SECRET`     | preview, production | HMAC secret shared with the site for `x-konf-client-ip`         |

The site (Vercel, preview and production) holds the other halves:
`KONF_SITE_SIGNING_KEY`, a private Ed25519 JWK with a `kid`, and the same
`CLIENT_IP_SECRET`. With them the site's server lane sends `x-konf-service`, a
60-second EdDSA JWT `{ iss: "konf-site", aud: "konf-gateway", host, iat, exp,
jti }`, and the signed visitor IP. The gateway resolves the tenant from the
asserted host instead of `Origin` only when the assertion verifies against a
key in `SITE_PUBLIC_KEYS`; a missing, forged, stale or replayed (same `jti`,
per isolate) one is ignored. The assertion grants no role.
Every identity JWT, in both lanes, must carry an `origin` claim (the handoff
origin, #1803) whose host equals the resolved host (asserted host, else
`Origin`); a missing or different claim gets 401.
Unset secrets leave the old behaviour: anonymous, tenant from `Origin`.

Operator lane (kontroll, #1892 phase 4): set the var `OPERATOR_ORIGIN` (e.g.
`https://my.konf.app`). A request whose `Origin` is that origin, with no site
assertion, is an operator request. It must carry an identity JWT whose `origin`
claim is the same origin, and the user must have `platformOperator` in identity;
otherwise 401 or 403. Without `x-konf-operator-tenant` it gets a
`PlatformContext`, which no Scoped repository accepts. With
`x-konf-operator-tenant: <tenant host>` it gets an ordinary tenant envelope for
that tenant, with the operator's own `orgRole` there and scope
`platform:operator`, so writes still need owner/admin. Unset turns the lane off.

To rotate, add the new kid to `SITE_PUBLIC_KEYS`, switch
`KONF_SITE_SIGNING_KEY`, then drop the old kid. A key pair:

```sh
node -e 'const {generateKeyPairSync:g}=require("crypto");const k=g("ed25519");console.log(JSON.stringify({...k.privateKey.export({format:"jwk"}),kid:"site-1"}));console.log(k.publicKey.export({type:"spki",format:"pem"}))'
```

Subgraphs get the matching public key as `GATEWAY_PUBLIC_KEY`. The var
`IDENTITY_ISSUER` (in `wrangler.jsonc`, per env) is the identity JWT `iss`.
Identity signs with the same value, from its own `IDENTITY_ISSUER`; keep the
two equal per environment.
Secrets are never committed. Set
them per environment with `npx wrangler secret put <NAME> --env <env>`, and
never reuse a production value in `preview`. List each new secret here, with
the environments that need it, in the PR that adds it.
