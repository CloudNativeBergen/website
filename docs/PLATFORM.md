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

## The read path flag

`src/lib/conference/konf-api.ts` lets the site read conference fields from the API instead of Sanity, per tenant:

- `KONF_API_TENANTS` is a comma-separated list of conference ids or organization ids. Empty or unset means off for everyone.
- For a listed tenant, the site's server calls `api.konf.app` for the request's host and merges the returned fields over the Sanity conference. The result is cached with the same tags as the Sanity read, so a revalidation clears both.
- Any error, a timeout (2 seconds), a `null` answer or a conference id that does not match makes the site use the Sanity data for that request. Turning a tenant off is removing it from the list.

## The write path flag

`src/lib/konf-api/conference-write.ts` lets the admin write the moved conference fields to D1 through `api.konf.app`, per tenant (#1881):

- `KONF_D1_WRITE_TENANTS` is a comma-separated list of conference ids. Empty or unset means off for everyone. It is unset in every environment.
- For a listed tenant, each settings save sends its moved fields to `updateConference` first, with the organizer's identity JWT. If that fails, the save fails and Sanity is not touched. Then Sanity gets the whole patch. If Sanity fails after D1 succeeded, the error is logged with the conference id and the save returns a warning.
- An organizer with no identity session (`KONF_IDENTITY_TENANTS` off, or not signed in through identity) cannot save moved fields for a listed tenant. Only list tenants that are also in `KONF_IDENTITY_TENANTS`.

Which subgraph answers for a tenant is a separate switch in the gateway (`@override`). The site does not need to know about it.

## Further reading

- `api/README.md`: gateway commands and environments.
- Private: RunKonf/infra `docs/platform/` (`ARCHITECTURE.md`, `SPEC.md`, `DECISIONS.md`) for the full design.
