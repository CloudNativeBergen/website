// #1835: Conference is one entity in content and conference. services/conference
// takes Query.conference and the structured fields over from services/content
// with @override(from: "content", label: "conference"), and Hive Gateway routes
// them per request through `progressiveOverride`; editorial fields stay in
// content. The
// label is static in the schema; which tenants it is on for is a per-request
// decision, so one label can roll a domain out tenant by tenant.
import { describe, expect, it } from 'vitest'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import httpTransport from '@graphql-mesh/transport-http'
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import { parse } from 'graphql'
import { schema as conference } from '../../services/conference/src/subgraph'
import { schema as content } from '../../services/content/src/subgraph'
import { D1_OVERRIDE_LABELS, progressiveOverride } from './gateway'
import { compose, publicContract } from './supergraph'

const sdl = (s: Parameters<typeof publicContract>[0]) =>
  printSchemaWithDirectives(publicContract(s))
const { supergraphSdl: supergraph, errors } = composeServices(
  Object.entries({ content: sdl(content), conference: sdl(conference) }).map(
    ([name, sdl]) => ({
      name,
      url: `https://${name}.internal/graphql`,
      typeDefs: parse(sdl),
    }),
  ),
)

describe('content in the supergraph', () => {
  it('composes alone (with tenant-directory)', () => {
    expect(compose()).toMatch(/conference: Conference/)
  })

  it('composes with services/conference overriding it', () => {
    expect(errors ?? []).toEqual([])
    expect(supergraph).toMatch(
      /override: "content", overrideLabel: "conference"/,
    )
    // Editorial fields have no copy in the conference service.
    const native = sdl(conference)
    expect(native).toMatch(/type Conference @key\(fields: "id"/)
    for (const f of [
      'description',
      'homepageSections',
      'logoBright',
      'logoDark',
      'logomarkBright',
      'logomarkDark',
    ])
      expect(native).not.toMatch(new RegExp(`\\b${f}:`))
  })
})

describe('progressive override', () => {
  // The gateway's handler; d1_override is on for org_a's conference only.
  const runtime = createGatewayRuntime<{
    orgId: string
    flags: { d1Override: boolean }
  }>({
    supergraph: supergraph!,
    transports: { http: httpTransport },
    progressiveOverride: (label, ctx) => progressiveOverride(label, ctx),
    fetchAPI: {
      // Each subgraph answers with its own name, so the test sees the route.
      fetch: (async (url: string, init: RequestInit) => {
        const from = new URL(url).host.split('.')[0]
        const { query } = JSON.parse(String(init.body)) as { query: string }
        return Response.json({
          data: query.includes('_entities')
            ? { _entities: [{ __typename: 'Conference', description: from }] }
            : {
                conference: {
                  __typename: 'Conference',
                  id: 'c',
                  title: from,
                  description: from,
                },
              },
        })
      }) as never,
    },
  })

  const conferenceFor = async (orgId: string) => {
    const res = await runtime.fetch(
      'http://gw/graphql',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ conference { title description } }' }),
      },
      { orgId, flags: { d1Override: orgId === 'org_a' } },
    )
    return ((await res.json()) as { data: { conference: unknown } }).data
      .conference
  }

  it('moves the root and structured fields with the label, per tenant', async () => {
    // Editorial fields stay in content, reached through the entity key.
    expect(await conferenceFor('org_a')).toEqual({
      title: 'conference',
      description: 'content',
    })
    expect(await conferenceFor('org_b')).toEqual({
      title: 'content',
      description: 'content',
    })
  })

  it('keeps a tenant on content without d1_override or flags', () => {
    for (const label of ['conference', 'conference-settings']) {
      for (const flags of [{ d1Override: false }, null, undefined])
        expect(progressiveOverride(label, { orgId: 'org_a', flags })).toBe(
          false,
        )
      expect(
        progressiveOverride(label, {
          orgId: null,
          flags: { d1Override: true },
        }),
      ).toBe(false)
    }
  })

  it('turns conference-settings on with d1_override, as conference (#2019)', () => {
    const flags = { d1Override: true }
    expect(progressiveOverride('conference', { orgId: 'org_a', flags })).toBe(
      true,
    )
    expect(
      progressiveOverride('conference-settings', { orgId: 'org_a', flags }),
    ).toBe(true)
    expect(progressiveOverride('unknown', { orgId: 'org_a', flags })).toBe(
      false,
    )
  })

  it('switches every @override label in the supergraph by d1_override', () => {
    // A new label missing from D1_OVERRIDE_LABELS would never turn on.
    const labels = new Set(compose().match(/(?<=overrideLabel: ")[^"]+/g))
    expect([...labels].sort()).toEqual([...D1_OVERRIDE_LABELS].sort())
  })
})
