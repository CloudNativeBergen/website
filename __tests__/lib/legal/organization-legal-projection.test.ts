import { describe, it, expect, vi, beforeEach } from 'vitest'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import type { Conference } from '@/lib/conference/types'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientRead: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

const { resolveLegalConfig } = await import('@/lib/legal/resolve')

const CONFIG_SOURCE = resolvePath(__dirname, '../../../src/lib/legal/config.ts')

/**
 * The top-level property names declared on `OrganizationLegalFields`.
 *
 * PARSED WITH THE TYPESCRIPT COMPILER, not a regex. A hand-rolled scan of the
 * interface body was tried first and quietly missed three real shapes —
 * `readonly x?: string`, a quoted key `'registered-address'?: string`, and any
 * field following a doc comment containing an unbalanced `}` (which truncated
 * the scan). Each miss makes this whole file pass while the projection is
 * incomplete: the exact failure it exists to catch, wearing a green tick.
 *
 * Nested members are excluded on purpose — the projection selects
 * `supervisoryAuthority` whole, so its children come along and are not
 * separately nameable.
 */
function declaredLegalFields(): string[] {
  const source = ts.createSourceFile(
    CONFIG_SOURCE,
    readFileSync(CONFIG_SOURCE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )

  let members: readonly ts.TypeElement[] | undefined
  source.forEachChild((node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === 'OrganizationLegalFields'
    ) {
      members = node.members
    }
  })
  expect(
    members,
    'OrganizationLegalFields was renamed or removed',
  ).toBeDefined()

  return members!
    .filter(ts.isPropertySignature)
    .map((member) => {
      const name = member.name
      // Covers `foo`, `'foo'` and `"foo"`. A computed key would be neither and
      // is deliberately dropped rather than guessed at.
      if (ts.isIdentifier(name)) return name.text
      if (ts.isStringLiteral(name)) return name.text
      return null
    })
    .filter((name): name is string => name !== null)
}

/** The only conference field the resolver reads: the organization reference. */
function conferenceWithOrg(): Conference {
  return {
    organization: { _type: 'reference', _ref: 'org-under-test' },
  } as unknown as Conference
}

/**
 * The PROJECTION BODY of the captured query — everything inside the outermost
 * `{ … }`.
 *
 * Matching against the whole query text produced a false pass: the filter
 * `*[_id == $id][0]` contains `$id`, so a field named `id` "appeared" in a
 * projection that never mentioned it.
 */
function projectionBody(query: string): string {
  const open = query.indexOf('{')
  const close = query.lastIndexOf('}')
  expect(
    open >= 0 && close > open,
    'no projection braces found — the query shape changed',
  ).toBe(true)
  return query.slice(open + 1, close)
}

async function capturedQuery(): Promise<string> {
  fetchMock.mockResolvedValue({ name: 'Some Org' })
  await resolveLegalConfig(conferenceWithOrg())
  expect(
    fetchMock,
    'the resolver did not query at all — the harness is broken',
  ).toHaveBeenCalledTimes(1)
  return projectionBody(String(fetchMock.mock.calls[0][0]))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the organization legal projection', () => {
  it('reads the interface — the expectation below is not an empty list', () => {
    const fields = declaredLegalFields()
    // Vacuity guard: a parser that matched nothing would make every assertion
    // below trivially true.
    expect(fields).toContain('name')
    expect(fields).toContain('legalEntityName')
    expect(fields).toContain('contactEmail')
    expect(fields).toContain('legalJurisdiction')
    // LAST in the declaration, so a parser that stopped early would drop it.
    expect(fields).toContain('supervisoryAuthority')
    expect(fields).toHaveLength(5)
  })

  it('projects every field the resolver declares it reads', async () => {
    const query = await capturedQuery()
    const missing = declaredLegalFields().filter(
      (field) => !new RegExp(`\\b${field}\\b`).test(query),
    )
    expect(missing).toEqual([])
  })

  it('projects legalEntityName specifically', async () => {
    // Named on its own because its absence is INVISIBLE downstream: the
    // controller falls back to the display name and the page looks fine.
    expect(await capturedQuery()).toContain('legalEntityName')
  })

  it('carries the projected legal entity through to the controller name', async () => {
    fetchMock.mockResolvedValue({
      name: 'Cloud Native Days Norway',
      legalEntityName: 'Cloud Native Bergen',
    })
    const legal = await resolveLegalConfig(conferenceWithOrg())
    // A VALUE, not an absence: this fails if the projection stops carrying the
    // field OR if `buildLegalConfig` stops preferring it.
    expect(legal.controllerName).toBe('Cloud Native Bergen')
    expect(legal.controllerResolved).toBe(true)
  })
})
