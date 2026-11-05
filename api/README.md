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

The full inventory (every secret, who holds it, fnox key, rotation) is in [docs/SECRETS.md](../docs/SECRETS.md).

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
`https://my.konf.app`): exact origins, comma-separated, in the same format as
identity's `OPERATOR_ORIGINS`. Keep the two lists equal (#1948). A request whose
`Origin` exactly equals an entry, with no site assertion, is an operator
request. It must carry an identity JWT whose `origin` claim is the same origin
(identity hands that token only to platform operators and organization members,
#1956); otherwise 401. The tenant header is resolved only after that JWT
verifies (#1954). Membership is re-read on every request.

- Platform operator, no `x-konf-operator-tenant`: a `PlatformContext`, which no
  Scoped repository accepts.
- Platform operator, `x-konf-operator-tenant: <tenant host>`: an ordinary
  tenant envelope for that tenant with the operator's own `orgRole` there
  (often null) and scope `platform:operator`, so writes still need
  owner/admin. An unknown host gets 400.
- Member, naming a tenant host of an org they belong to: an ordinary tenant
  envelope with their own `orgRole` and no scope. An org they do not belong
  to, and an unknown host, both get the same 403 before any subgraph read.
- Member, no header: no envelope, the same as anonymous.

`organizations(first, after)` (#1973) lists every org, ordered by slug, with
`createdAt` (null for orgs provisioned before it existed). Only a
`PlatformContext` gets it; everyone else, operators with a tenant selected
included, gets FORBIDDEN before any D1 read. At most 100 per page: pass the
last slug as `after` for the next.

`conferences(first, after, lifecycle, flag)` (#1985) lists every org's
conferences, ordered by id, under the same rule: a `PlatformContext` only,
FORBIDDEN before any D1 read for everyone else. tenant-directory serves the
row (`id`, `lifecycleStatus`, `organization`, `flags`); `edition { title
startDate endDate primaryHost }` comes from the conference subgraph, whose
`ConferenceEdition` entity resolves any org's edition for a `PlatformContext`
only (`unscopedForPlatformOps`, logged as `operator.read`). `primaryHost` is
null until #1977. `lifecycle` and `flag` (that flag on) are enums. At most 100
per page: pass the last id as `after` for the next.

`rolloutFlags` returns the selected tenant's flags to an operator or member who
got its envelope, else null. Unset turns the lane off.

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
