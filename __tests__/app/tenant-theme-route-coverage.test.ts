import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * WHICH ROUTE GROUPS GET THE TENANT THEME.
 *
 * The boundary is a product decision, not an accident of where a component
 * happened to be rendered:
 *
 *   IN  — everything an attendee sees: `(main)`, `(workshop)`, `(stream)`,
 *         `(public)` and the root `not-found`.
 *   OUT — `(cfp)` (the speaker portal: one familiar interface across every
 *         conference a speaker submits to) and `(admin)` (the palette is
 *         FUNCTIONAL there — status, alerts, charts — and a tenant hue would
 *         collide with colour that carries meaning).
 *
 * The theme is injected by `TenantThemeStyle`, reached either directly or
 * through the shared `Layout`. The root layout must NOT inject it — hoisting it
 * there is the one-line change that would silently theme the portal and admin,
 * so it is asserted against explicitly.
 *
 * A source scan is the honest shape for this: the property under test is the
 * COMPOSITION of the route tree, which no unit render can observe.
 */

const APP = resolve(__dirname, '../../src/app')

function read(relativePath: string): string {
  return readFileSync(resolve(APP, relativePath), 'utf8')
}

/**
 * Does this module pull in the theme injector (directly or via `Layout`)?
 *
 * Matches IMPORTS, not any mention of the name — the excluded layouts carry a
 * comment explaining why they deliberately have no `TenantThemeStyle`, and a
 * bare substring test would read that prose as the very thing it forbids.
 */
function injectsTheme(source: string): boolean {
  const importsInjector = /import\s*\{[^}]*\bTenantThemeStyle\b[^}]*\}\s*from/
  const importsLayout =
    /import\s*\{[^}]*\bLayout\b[^}]*\}\s*from '@\/components\/Layout'/
  return importsInjector.test(source) || importsLayout.test(source)
}

describe('tenant theme route coverage', () => {
  describe('public surfaces are themed', () => {
    it.each([
      ['(main)/layout.tsx'],
      ['(workshop)/layout.tsx'],
      ['(stream)/layout.tsx'],
      ['(public)/layout.tsx'],
      ['not-found.tsx'],
    ])('%s injects the tenant theme', (file) => {
      expect(injectsTheme(read(file))).toBe(true)
    })
  })

  describe('platform-neutral surfaces are NOT themed', () => {
    it.each([['(cfp)/layout.tsx'], ['(admin)/admin/layout.tsx']])(
      '%s does not inject the tenant theme',
      (file) => {
        expect(injectsTheme(read(file))).toBe(false)
      },
    )

    // The explicit guard against the tempting hoist: putting the injector in
    // the root layout would theme (cfp) and (admin) too.
    it('the ROOT layout does not inject the tenant theme', () => {
      const root = read('layout.tsx')
      expect(injectsTheme(root)).toBe(false)
      expect(root).not.toMatch(/<\s*(Tenant)?ThemeStyle\b/)
    })
  })

  describe('the injector resolves the host per group', () => {
    // (main), (workshop) and (stream) already resolve the conference for their
    // own reasons and PASS it in; only (public) has no other need for it and so
    // lets the component resolve the host itself. Asserting this keeps a future
    // edit from adding a redundant conference query to a group that has one.
    it.each([
      ['(main)/layout.tsx'],
      ['(workshop)/layout.tsx'],
      ['(stream)/layout.tsx'],
    ])('%s reuses its already-resolved conference', (file) => {
      const source = read(file)
      expect(source).toContain('getConferenceForCurrentDomain')
    })

    it('(public)/layout.tsx adds no conference query of its own', () => {
      const source = read('(public)/layout.tsx')
      expect(source).toContain('<TenantThemeStyle />')
      expect(source).not.toContain('getConferenceForCurrentDomain')
    })
  })
})
