// Spike (#1835): @override(from: "legacy", label:) composes, and Hive Gateway
// routes the overridden field per request through `progressiveOverride`. The
// label is static in the schema; which tenants it is on for is a per-request
// decision, so one label can roll a domain out tenant by tenant.
import { describe, expect, it } from 'vitest'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import httpTransport from '@graphql-mesh/transport-http'
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import { parse } from 'graphql'
import { schema as legacy } from '../../services/legacy/src/subgraph'
import { progressiveOverride } from './gateway'
import { compose, publicContract } from './supergraph'

const legacySdl = printSchemaWithDirectives(publicContract(legacy))
// services/conference (#1829) as it would take Query.conference over: the
// same types and fields, plus the override. Labels need federation v2.7.
const native = legacySdl
  .replace('federation/v2.6"', 'federation/v2.7"')
  .replace('import: [', 'import: ["@override", ')
  // #1829 keeps title non-null; composition merges it as nullable.
  .replace(/\btitle: String\b/, 'title: String!')
  .replace(
    /conference: Conference/,
    '$& @override(from: "legacy", label: "conference")',
  )

const { supergraphSdl: supergraph, errors } = composeServices(
  Object.entries({ legacy: legacySdl, conference: native }).map(
    ([name, sdl]) => ({
      name,
      url: `https://${name}.internal/graphql`,
      typeDefs: parse(sdl),
    }),
  ),
)

describe('legacy in the supergraph', () => {
  it('composes alone (with tenant-directory)', () => {
    expect(compose()).toMatch(/conference: Conference/)
  })

  it('composes with a native service that overrides it', () => {
    expect(errors ?? []).toEqual([])
    expect(supergraph).toMatch(
      /override: "legacy", overrideLabel: "conference"/,
    )
  })
})

describe('progressive override (spike)', () => {
  // The gateway's handler; the label is on for org_a only.
  const env = { OVERRIDE_TENANTS: { conference: ['org_a'] } }
  const runtime = createGatewayRuntime<{ env: typeof env; orgId: string }>({
    supergraph: supergraph!,
    transports: { http: httpTransport },
    progressiveOverride: (label, ctx) => progressiveOverride(label, ctx),
    fetchAPI: {
      fetch: (async (url: string) =>
        Response.json({
          data: {
            conference: { id: 'c', title: new URL(url).host.split('.')[0] },
          },
        })) as never,
    },
  })

  const titleFor = async (orgId: string) => {
    const res = await runtime.fetch(
      'http://gw/graphql',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ conference { title } }' }),
      },
      { env, orgId },
    )
    return ((await res.json()) as { data: { conference: { title: string } } })
      .data.conference.title
  }

  it('routes by label per tenant', async () => {
    expect(await titleFor('org_a')).toBe('conference')
    expect(await titleFor('org_b')).toBe('legacy')
  })

  it('keeps everyone on legacy while OVERRIDE_TENANTS is empty', () => {
    const empty = { env: { OVERRIDE_TENANTS: {} }, orgId: 'org_a' }
    expect(progressiveOverride('conference', empty)).toBe(false)
    expect(progressiveOverride('conference', { env, orgId: null })).toBe(false)
  })
})
