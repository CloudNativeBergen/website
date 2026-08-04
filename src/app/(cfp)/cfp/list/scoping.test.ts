/**
 * @vitest-environment node
 *
 * `/cfp/list` (the speaker dashboard) TENANT SCOPING (#730/F2).
 *
 * The conferences query used to drop its tenant predicate entirely when the
 * host's org could not be resolved — listing EVERY tenant's conference metadata
 * (`cfpEmail`, `contactEmail`, `domains`, dates) to any signed-in speaker, and
 * then fanning out per-conference speaker reads across all of them. Its
 * `!defined(organization)` arm additionally showed org-less conferences to every
 * tenant.
 *
 * The page is a server component with a large dependency graph, so this asserts
 * the SHAPE of the fix at the source level rather than rendering it. It is a
 * tripwire against reintroducing the migration bridge, not a substitute for the
 * behavioural guards — those live in `src/server/tenancy.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(process.cwd(), 'src/app/(cfp)/cfp/list/page.tsx'),
  'utf8',
)
/** The source with `//` comments stripped, so prose about the OLD shape (which
 * deliberately quotes it) cannot satisfy or break these assertions. */
const code = source.replace(/^\s*\/\/.*$/gm, '')

describe('/cfp/list conferences query', () => {
  it('carries the tenant predicate UNCONDITIONALLY', () => {
    expect(code).toContain(
      '*[_type == "conference" && organization._ref == $orgId]',
    )
  })

  it('has no optional-tenant arm — an org-less conference belongs to nobody', () => {
    expect(code).not.toContain('!defined(organization)')
  })

  it('does not interpolate the predicate, so it cannot be conditionally dropped', () => {
    // The old shape was `*[_type == "conference"${orgRef ? ' && …' : ''}]`.
    expect(code).not.toMatch(/\*\[_type == "conference"\$\{/)
  })

  it('FAILS CLOSED: an unresolvable org yields an empty list instead of a query', () => {
    expect(code).toMatch(/const conferences = orgRef\s*\?/)
    expect(code).toMatch(/\)\s*:\s*\[\]/)
  })
})
