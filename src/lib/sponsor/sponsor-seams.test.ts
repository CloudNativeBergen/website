/**
 * @vitest-environment node
 *
 * Which sponsors a caller gets is decided by what it asks for (#1772):
 * getPublicSponsors / `publicSponsors: true` (the API for apiRead tenants:
 * logos as data URLs, no `_sfcId`, tier price or ticket entitlement) or the
 * Sanity read. The CRM, sponsor admin, contracts, tickets and the portal must
 * never take the public one; every public sponsor reader must.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../../..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)
      ? [p]
      : []
  })
}
const rel = (p: string) => relative(ROOT, p)
const read = (p: string) => readFileSync(p, 'utf8')
const PUBLIC = /\b(getPublicSponsors|publicSponsors)\b/

const EDITORS = [
  'src/app/(admin)',
  'src/app/(main)/sponsor/portal',
  'src/app/(main)/sponsor/onboarding',
  'src/components/admin',
  'src/components/sponsor',
  'src/lib/sponsor-crm',
  'src/lib/tickets',
  'src/server/routers',
].flatMap((d) => files(join(ROOT, d)))

describe('sponsor seams', () => {
  it('scans the admin, CRM, contract and portal trees', () => {
    expect(EDITORS.length).toBeGreaterThan(100)
    for (const f of [
      'src/server/routers/sponsor.ts',
      'src/lib/sponsor-crm/contract-pdf.tsx',
      'src/components/sponsor/SponsorPortal.tsx',
      'src/app/(main)/sponsor/portal/[token]/page.tsx',
    ])
      expect(EDITORS.map(rel)).toContain(f)
  })

  it('admin, CRM, contracts, tickets and the portal never read the public sponsors', () => {
    expect(EDITORS.filter((p) => PUBLIC.test(read(p))).map(rel)).toEqual([])
  })

  it('every public sponsor reader uses the public one', () => {
    for (const f of [
      'src/app/(main)/page.tsx',
      'src/app/(main)/sponsor/page.tsx',
      'src/app/(main)/program/page.tsx',
      'src/app/(main)/speaker/[slug]/opengraph-image.tsx',
      'src/app/(stream)/stream/[room]/page.tsx',
      'src/app/(public)/wall/screen/page.tsx',
    ])
      expect(read(join(ROOT, f)), f).toMatch(PUBLIC)
  })

  it('no public page asks for sponsors with the bare flag', () => {
    const offenders = ['src/app/(main)', 'src/app/(stream)', 'src/app/(public)']
      .flatMap((d) => files(join(ROOT, d)))
      .filter(
        (p) =>
          /^\s*sponsors:\s*true\b|\{\s*sponsors:\s*true\b/m.test(read(p)) ||
          /\bgetPublicSponsorsForConference\b/.test(read(p)),
      )
      .map(rel)
    expect(offenders).toEqual([])
  })
})
