# The Konf API platform

A short developer overview of the GraphQL API at `api.konf.app` and the services behind it (epic #1772). The full architecture lives in the private RunKonf/infra repository (`docs/platform/ARCHITECTURE.md`).

## What it is

- `api/` is the gateway: Hive Gateway on a Cloudflare Worker, serving `/graphql`. It composes a supergraph at build time from the subgraph schemas (`api/src/supergraph.ts`) and reaches each subgraph over a Worker service binding (`api/src/gateway.ts`).
- `services/<name>` are the subgraphs, one Worker per domain, written with Pothos. On `main`: `tenant-directory` (which conference a host belongs to), `identity` (Better Auth; no public subgraph), `content` (editorial fields and homepage blocks, read from Sanity) and `conference` (structured fields, D1). Logos come from `content`, not D1. More come per domain.
- `packages/tenancy` holds the code every subgraph uses to read the per-request tenant context and to keep data access scoped to one tenant.
- The site still reads most data from Sanity. Reads move to the API one module at a time, behind flags.

Fields are public unless they are tagged `@tag(internal)`; tagged fields are removed before composition.

## Add a subgraph

1. Create `services/<name>/service.cue`:

   ```cue
   package codegen

   service: #PlatformService & {name: "<name>"}
   ```

   Tenancy is on by default. The template is `services/platform-service.cue`.

2. Run `pnpm scaffold:service <name>`. It needs the `cue` binary (`mise install`). It writes `package.json`, `wrangler.jsonc`, `tsconfig.json`, `src/worker.ts` and `src/builder.ts`, and stubs `src/subgraph.ts`, `src/data/` and `migrations/0001_init.sql` if they are missing. Do not edit the generated files; change `service.cue` and scaffold again.
3. Write the schema in `src/subgraph.ts` and the data access in `src/data/`. Resolvers only see what `createData` returns.
4. Register it in the gateway: add the schema to `SUBGRAPHS` in `api/src/supergraph.ts`, the binding to `BINDINGS` in `api/src/gateway.ts`, and the service binding to each env in `api/wrangler.jsonc`.
5. Add the package to the deploy step in `.github/workflows/deploy-workers.yml`. Binding targets deploy before the gateway.
6. Ask a maintainer to create the D1 databases and set the Worker's per-environment settings.

`pnpm scaffold:check` (also run in CI) fails if a generated file has drifted from the template.

## Run the tests

```sh
pnpm test                              # everything, including api/ and services/
pnpm --filter @runkonf/api test        # the gateway only
pnpm --filter @runkonf/tenant-directory test
pnpm typecheck                         # root and every Worker package
pnpm --filter @runkonf/api compose     # fails if the subgraphs do not compose
pnpm --filter @runkonf/api dev         # compose, then wrangler dev
```

Identity tests run against a real local D1 through Miniflare. A cross-tenant test that walks the whole public schema with two tenants runs with them (#1837).

## Rollout flags

Each conference has four rollout flags in tenant-directory D1 (`conferences` table, #1925). They default to off. No GraphQL mutation writes them; an operator sets them with SQL:

| Column           | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `api_read`       | The site reads core conference fields from `api.konf.app`.        |
| `identity_login` | The site signs in through identity (`id.konf.app`).               |
| `d1_write`       | The admin writes the moved conference fields to D1 before Sanity. |
| `d1_override`    | The gateway routes the `conference` `@override` label to D1.      |

```sh
pnpm --filter @runkonf/tenant-directory exec wrangler d1 execute DB --remote --env production \
  --command "UPDATE conferences SET api_read = 1 WHERE id = '<conference id>'"
```

How they travel: `tenantByHost` returns them, and the gateway reads them with its tenant lookup on every request. `d1_override` applies at once. The site asks the gateway's `rolloutFlags` query, which answers only on the site's signed server lane and only for the asserted host, so it takes no argument and no other caller sees a tenant's flags. The site caches the answer per host for 5 minutes (stale up to an hour), so a change in D1 reaches the site within minutes. The site needs `KONF_SITE_SIGNING_KEY` to read them.

Fail safe: if the read fails or times out (2 seconds), the site treats the D1 flags as off for that request: the Sanity path.

Kill switch: `KONF_API_DISABLED=1` on Vercel turns all three site flags off for every tenant, env lists included, and stops identity sessions. The gateway has no switch; set `d1_override = 0` in D1 instead.

<a id="the-read-path-flag"></a>

### Read path (`api_read`)

`src/lib/conference/konf-api.ts` merges the API's conference fields over the Sanity conference. The result is cached with the same tags as the Sanity read. Any error, a timeout, a `null` answer or a conference id that does not match makes the site use the Sanity data for that request.

<a id="the-write-path-flag"></a>

### Write path (`d1_write`)

`src/lib/konf-api/conference-write.ts` sends each settings save's moved fields to `updateConference` first, with the organizer's identity JWT (#1881). If that fails, the save fails and Sanity is not touched. If Sanity fails after D1 succeeded, the error is logged and the save returns a warning. An organizer without an identity session cannot save moved fields, so turn `d1_write` on only together with `identity_login`.

### Transition: the old env lists

Until the D1 flags are backfilled (`services/tenant-directory/migrations/0003_backfill_cndn_2026_flags.sql`), the old lists still work and are OR'ed with the D1 flags: `KONF_API_TENANTS` and `KONF_IDENTITY_TENANTS` (conference or organization ids), `KONF_D1_WRITE_TENANTS` (conference ids) on Vercel, and `OVERRIDE_TENANTS` (organization ids per label) in `api/wrangler.jsonc`. To remove them:

1. Approve the production Workers deploy, which applies migrations 0002 and 0003. Check the CNDN 2026 row: `SELECT id, api_read, identity_login, d1_write, d1_override FROM conferences WHERE api_read OR identity_login OR d1_write OR d1_override`.
2. Delete `KONF_API_TENANTS`, `KONF_IDENTITY_TENANTS` and `KONF_D1_WRITE_TENANTS` from every Vercel environment and redeploy. Check that sign-in through identity and the settings save still work on 2026.cloudnativedays.no.
3. Delete `listed()` and its three calls in `src/lib/conference/konf-api.ts`, and the `OVERRIDE_TENANTS` var with its check in `progressiveOverride` (`api/src/gateway.ts`), in one PR.

## Data ownership

Which system owns each entity, and how data moves between owners: [DATA_OWNERSHIP.md](./DATA_OWNERSHIP.md).

## Further reading

- `api/README.md`: gateway commands and environments.
- Private: RunKonf/infra `docs/platform/` (`ARCHITECTURE.md`, `SPEC.md`, `DECISIONS.md`) for the full design.
