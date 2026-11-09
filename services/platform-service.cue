// #PlatformService: the template every subgraph service is generated from.
// A service writes services/<name>/service.cue:
//
//   package codegen
//   service: #PlatformService & {name: "cfp"}
//
// and runs `pnpm scaffold:service <name>`. Tenancy is on by default; the only
// opt-out is an explicit `tenancy: false`.
//
// Ported from RunKonf/konf-grapql-poc@poc (poc/codegen/platform-service.cue)
// with the POC's validated build facts kept (nodejs_compat, Pothos
// useGraphQLToolsUnorderedDirectives, graphql 16) and its shortcuts removed
// (no /__migrate endpoint, no shared KV, no key committed in vars).
package codegen

#PlatformService: {
	name:    string & =~"^[a-z][a-z0-9-]*$"
	tenancy: *true | false
	// Cron Trigger schedules. A cron has no envelope. Tenancy-off: the
	// service exports `scheduled(data, scheduledTime)` from src/data. Tenancy-on (db only):
	// it exports `scheduled(env)` and `ScheduledEnv` from src/data, and the
	// cron gets env directly, never a resolver.
	crons: *[] | [...string]
	// Worker service bindings (RPC). The service types them in its DataEnv.
	serviceBindings: *[] | [...{binding: string, service: string, entrypoint?: string}]
	if tenancy && !db {crons: []}

	// Custom-domain routes per environment, for a service with its own
	// public surface (identity). Subgraphs keep none (epic #1772, req. 8).
	routes: {
		preview: *[] | [...string]
		production: *[] | [...string]
	}
	if tenancy {routes: {preview: [], production: []}}

	// Workers Rate Limiting bindings. The namespace ids are per environment
	// (account-wide integers the owner picks once); not inherited by envs.
	rateLimits: *[] | [...{
		name: string
		namespaceId: {preview: string, production: string}
		limit:  int
		period: 10 | 60
	}]
	// Extra tsconfig include globs, e.g. a service's scripts/.
	tsInclude: *[] | [...string]
	// `db: false`: no D1 (the content subgraph reads Sanity). Tenancy-on only:
	// createData then takes the service's DataEnv instead of the D1 handle.
	db: *true | false
	if !tenancy {db: true}

	// `subgraph: false`: an RPC-only Worker behind service bindings
	// (notifications). No GraphQL schema, no envelope, no graphql deps; the
	// service writes its own `main`.
	subgraph: *true | false
	if !subgraph {tenancy: false}

	// Plain wrangler vars per environment; the top level (wrangler dev) gets
	// preview's. Secrets never go here.
	vars: {
		preview: *{} | {[string]: string}
		production: *{} | {[string]: string}
	}

	// Worker secret names (names only, never values), the same in both
	// environments. Generated into secrets.json; `mise run secrets:sync` puts
	// them from fnox. After a production deploy a missing `required` name
	// fails the job; a missing `optional` one (the code degrades) warns.
	secrets: {
		required: *[] | [...string]
		optional: *[] | [...string]
	}

	// D1 database ids per environment. The owner creates each database once
	// (`wrangler d1 create konf-<name>[-preview]`) and commits the id in
	// service.cue. CI dry-runs an environment while its id is TO_BE_CREATED.
	d1: {
		preview:    *"TO_BE_CREATED" | string
		production: *"TO_BE_CREATED" | string
	}

	_workerName:       "konf-\(name)"
	_scheduledImport:  *"" | string
	_scheduledHandler: *"" | string
	_dataImport:       *"" | string
	_envHead:          *"export interface WorkerEnv {\n  DB: D1Database" | string
	_dataArg:          *"env.DB" | string
	if !db {
		_dataImport: ", type DataEnv"
		_envHead:    "export interface WorkerEnv extends DataEnv {"
		_dataArg:    "env"
	}
	if len(crons) > 0 && !tenancy {
		_scheduledImport:  ", scheduled"
		_scheduledHandler: "\n  scheduled: (controller: ScheduledController, env: WorkerEnv) =>\n    scheduled(createData(env), controller.scheduledTime),"
	}
	if len(crons) > 0 && tenancy {
		_dataImport:       ", scheduled, type ScheduledEnv"
		_envHead:          "export interface WorkerEnv extends ScheduledEnv {\n  DB: D1Database"
		_scheduledHandler: "\n  scheduled: (_controller: ScheduledController, env: WorkerEnv) =>\n    scheduled(env),"
	}

	// JSON files, written verbatim.
	files: {
		"package.json": {
			"name":    "@runkonf/\(name)"
			"private": true
			"type":    "module"
			"scripts": {
				"typecheck": "tsc --noEmit"
				"test":      "vitest run --root ../.. services/\(name)/"
				"deploy":    "wrangler deploy"
			}
			"dependencies": {
				if !subgraph {"@runkonf/tenancy": "workspace:*"}
				if subgraph {
					// Tenancy-exempt services still verify a PlatformContext.
					"@runkonf/tenancy": "workspace:*"
					// 2.15 dropped dist/types EntityType, which plugin-federation 4.5
					// imports: the worker then fails at startup. 2.14.3 is what the
					// POC validated.
					"@apollo/subgraph":          "~2.14.3"
					"@pothos/core":              "^4"
					"@pothos/plugin-directives": "^4"
					"@pothos/plugin-federation": "^4"
					// What @apollo/subgraph and Hive Gateway expect. Exact pin.
					"graphql":      "16.14.2"
					"graphql-yoga": "^5"
				}

				// better-auth's drizzle adapter needs ^0.45.2.
				if db {"drizzle-orm": "^0.45.2"}

				// A service adds its own dependencies in service.cue.
				...
			}
			"devDependencies": {
				"@cloudflare/workers-types": "^5.20261101.1"
				"wrangler":                  "^4.156.0"
				...
			}
		}
		"wrangler.jsonc": {
			"name": _workerName
			// Every service deploys to the RunKonf account.
			"account_id": "eefa2cb5c8528a07d7bf8b00a6606dcd"
			// A service with its own HTTP surface (identity) points main at
			// its own entry; src/worker.ts stays generated.
			"main":               *"src/worker.ts" | string
			"compatibility_date": "2026-08-01"
			"compatibility_flags": ["nodejs_compat"]
			// Subgraphs have no public routes; the gateway reaches them by
			// service binding. The envelope is still the boundary.
			"workers_dev":  false
			"preview_urls": false
			if db {
				"d1_databases": [{
					"binding":        "DB"
					"database_name":  _workerName
					"database_id":    "TO_BE_CREATED"
					"migrations_dir": "migrations"
				}]
			}
			if len(vars.preview) > 0 {"vars": vars.preview}
			if len(crons) > 0 {
				"triggers": {"crons": crons}
			}
			if len(serviceBindings) > 0 {
				"services": serviceBindings
			}

			// d1_databases and services are not inherited by wrangler envs, so
			// each env repeats them. Preview binds preview Workers only: no
			// production data or keys reach a preview (epic #1772, req. 8).
			"env": {
				"preview": {
					"name": "\(_workerName)-preview"
					if len(rateLimits) > 0 {
						"ratelimits": [for r in rateLimits {
							name:         r.name
							namespace_id: r.namespaceId.preview
							simple: {limit: r.limit, period: r.period}
						}]
					}
					if len(routes.preview) > 0 {
						"routes": [for r in routes.preview {pattern: r, custom_domain: true}]
					}
					if db {
						"d1_databases": [{
							"binding":        "DB"
							"database_name":  "\(_workerName)-preview"
							"database_id":    d1.preview
							"migrations_dir": "migrations"
						}]
					}
					if len(vars.preview) > 0 {"vars": vars.preview}
					if len(serviceBindings) > 0 {
						"services": [for b in serviceBindings {
							binding: b.binding
							service: "\(b.service)-preview"
							if b.entrypoint != _|_ {entrypoint: b.entrypoint}
						}]
					}
				}
				"production": {
					"name": _workerName
					if len(rateLimits) > 0 {
						"ratelimits": [for r in rateLimits {
							name:         r.name
							namespace_id: r.namespaceId.production
							simple: {limit: r.limit, period: r.period}
						}]
					}
					if len(routes.production) > 0 {
						"routes": [for r in routes.production {pattern: r, custom_domain: true}]
					}
					if db {
						"d1_databases": [{
							"binding":        "DB"
							"database_name":  _workerName
							"database_id":    d1.production
							"migrations_dir": "migrations"
						}]
					}
					if len(vars.production) > 0 {"vars": vars.production}
					if len(serviceBindings) > 0 {
						"services": serviceBindings
					}
				}
			}

			// OTLP export to Grafana Cloud. The destinations are configured
			// once per account in the Cloudflare dashboard.
			"observability": {
				"enabled": true
				"traces": {"enabled": true, "destinations": ["grafana-cloud-traces"]}
				"logs": {"enabled": true, "destinations": ["grafana-cloud-logs"]}
			}
		}
		"secrets.json": {preview: secrets, production: secrets}
		"tsconfig.json": {
			"compilerOptions": {
				"target":           "es2022"
				"module":           "esnext"
				"moduleResolution": "bundler"
				"lib": ["es2022"]
				"types": ["@cloudflare/workers-types", "node"]
				"strict":          true
				"noEmit":          true
				"skipLibCheck":    true
				"isolatedModules": true
			}
			"include": ["src/**/*.ts", for g in tsInclude {g}]
		}
	}

	// Generated sources, overwritten on every scaffold.
	sources: {
		if subgraph {
			"src/builder.ts": """
				// GENERATED by services/platform-service.cue. Do not edit.
				import SchemaBuilder from '@pothos/core'
				import DirectivesPlugin from '@pothos/plugin-directives'
				import FederationPlugin from '@pothos/plugin-federation'
				import type { ResolverContext } from './worker'

				export const builder = new SchemaBuilder<{ Context: ResolverContext }>({
				  plugins: [DirectivesPlugin, FederationPlugin],
				  // Required for federation directives to print in the order
				  // @apollo/subgraph expects (POC finding).
				  directives: { useGraphQLToolsUnorderedDirectives: true },
				})

				"""
		}
		if subgraph && tenancy {
			"src/worker.ts": """
				// GENERATED by services/platform-service.cue. Do not edit. Tenancy: ON.
				import { createYoga } from 'graphql-yoga'
				import { envelopeFromRequest, type SubgraphContext } from '@runkonf/tenancy'
				import { createData\(_dataImport) } from './data'
				import { schema } from './subgraph'

				\(_envHead)
				  /** wrangler secret put GATEWAY_PUBLIC_KEY (per environment) */
				  GATEWAY_PUBLIC_KEY: string
				}
				// Resolvers get the envelope and Scoped repositories, never env or DB.
				export type ResolverContext = SubgraphContext<ReturnType<typeof createData>>

				const yoga = createYoga<ResolverContext>({
				  schema,
				  graphqlEndpoint: '/graphql',
				  landingPage: false,
				})

				export default {
				  async fetch(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
				    // No request reaches a resolver without a valid envelope.
				    const result = await envelopeFromRequest(request, env.GATEWAY_PUBLIC_KEY)
				    if ('response' in result) return result.response
				    const envelope = result.envelope
				    const caller =
				      envelope.typ === 'tenant'
				        ? { 'konf.org_id': envelope.orgId, 'konf.conference_id': envelope.conferenceId ?? undefined }
				        : envelope.typ === 'platform'
				          ? { 'konf.platform_user': envelope.userId }
				          : { 'konf.user_id': envelope.userId }
				    // On the log line and on the request's span, so traces filter by tenant
				    // (#1814). An org-level envelope has no conference: the key is left out.
				    console.log(JSON.stringify(caller))
				    ctx?.tracing.getActiveSpan()?.setAttributes(caller)
				    return yoga.fetch(request, { envelope, data: createData(\(_dataArg), envelope) })
				  },\(_scheduledHandler)
				} satisfies ExportedHandler<WorkerEnv>

				"""
		}
		if subgraph && !tenancy {
			"src/worker.ts": """
				// GENERATED by services/platform-service.cue. Do not edit. Tenancy: OFF (explicit).
				import { createYoga } from 'graphql-yoga'
				import { ENVELOPE_HEADER, envelopeFromRequest, type Envelope } from '@runkonf/tenancy'
				import { createData, type DataEnv\(_scheduledImport) } from './data'
				import { schema } from './subgraph'

				export interface WorkerEnv extends DataEnv {
				  DB: D1Database
				  /** wrangler secret put GATEWAY_PUBLIC_KEY (per environment) */
				  GATEWAY_PUBLIC_KEY: string
				}
				// Resolvers get the envelope (null for anonymous gateway calls) and
				// the data layer, never env or DB.
				export interface ResolverContext {
				  envelope: Envelope | null
				  data: ReturnType<typeof createData>
				}

				const yoga = createYoga<ResolverContext>({
				  schema,
				  graphqlEndpoint: '/graphql',
				  landingPage: false,
				})

				export default {
				  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
				    // No envelope is allowed; a present one must verify.
				    let envelope: Envelope | null = null
				    if (request.headers.has(ENVELOPE_HEADER)) {
				      const result = await envelopeFromRequest(request, env.GATEWAY_PUBLIC_KEY)
				      if ('response' in result) return result.response
				      envelope = result.envelope
				    }
				    return yoga.fetch(request, { envelope, data: createData(env) })
				  },\(_scheduledHandler)
				} satisfies ExportedHandler<WorkerEnv>

				"""
		}
	}

	// Service-authored files, stubbed only when absent.
	stubs: {
		if subgraph {
			"src/subgraph.ts": """
			// \(name): author the Pothos federation subgraph here.
			import { builder } from './builder'

			// Add types and fields on `builder`; reach data via ctx.data.
			// toSubGraphSchema supplies Query._service, so an empty service
			// still starts.
			export const schema = builder.toSubGraphSchema({
			  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
			})

			"""
		}
		if db {
			"src/data/db.ts": """
				// The raw D1 handle. Only files under src/data/ may import this, and
				// none may re-export it (eslint, services boundary). Every table
				// carries org_id and conference_id.
				export const rawDb = (d1: D1Database) => d1

				"""
			"migrations/0001_init.sql": """
				-- Every tenant-owned table: org_id TEXT NOT NULL, conference_id TEXT,
				-- and an index leading with (org_id, conference_id).

				"""
		}
		if !db {
			"src/data/index.ts": """
				// Public data layer. createData is the ONLY export resolvers see:
				// it returns Scoped repositories, never a raw client.
				import type { Envelope } from '@runkonf/tenancy'

				/** Bindings the data layer needs; the generated WorkerEnv extends it. */
				export interface DataEnv {}

				export function createData(env: DataEnv, envelope: Envelope) {
				  void env
				  void envelope
				  return {}
				}

				"""
		}
		if tenancy && db {
			"src/data/index.ts": """
				// Public data layer. createData is the ONLY export resolvers see:
				// it returns Scoped repositories (classes extending ScopedRepository
				// from @runkonf/tenancy), never the raw handle.
				import type { Envelope } from '@runkonf/tenancy'
				import { rawDb } from './db'

				export function createData(d1: D1Database, envelope: Envelope) {
				  const db = rawDb(d1)
				  void db
				  void envelope
				  return {}
				}

				"""
		}
		if !tenancy {
			"src/data/index.ts": """
				// Public data layer. createData is the ONLY export resolvers see.
				import { rawDb } from './db'

				/** Bindings the data layer needs; the generated WorkerEnv extends it. */
				export interface DataEnv {
				  DB: D1Database
				}

				export function createData(env: DataEnv) {
				  const db = rawDb(env.DB)
				  void db
				  return {}
				}

				"""
		}
	}
}
