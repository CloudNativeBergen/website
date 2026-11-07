/**
 * @vitest-environment node
 *
 * Which CFP data a caller gets is decided by what it asks for (#2087):
 * getPublicCfp / `publicCfp: true` (the API for apiRead tenants: topics,
 * confirmed talks with speaker id/name only, and option catalogues) or the
 * Sanity read. Admin surfaces, the signed-in speaker submit/edit and
 * own-proposal flows, and workshop management must never take the public one;
 * every public CFP reader must.
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
const PUBLIC = /\b(getPublicCfp|publicCfp)\b/

const EDITORS = [
  'src/app/(admin)',
  'src/app/(cfp)',
  'src/app/(workshop)',
  'src/components/admin',
  'src/components/cfp',
  'src/components/proposal',
  'src/lib/schedule',
  'src/lib/dashboard',
  'src/lib/settings',
  'src/lib/speaker',
  'src/lib/invitation-letter',
  'src/lib/workshop',
  'src/server/routers',
].flatMap((d) => files(join(ROOT, d)))

describe('cfp seams', () => {
  it('scans the admin, speaker portal, proposal and workshop trees', () => {
    expect(EDITORS.length).toBeGreaterThan(100)
    for (const f of [
      'src/server/routers/proposal.ts',
      'src/app/(cfp)/cfp/proposal/page.tsx',
      'src/app/(cfp)/cfp/list/page.tsx',
      'src/app/(admin)/admin/proposals/page.tsx',
      'src/components/proposal/ProposalDetailsForm.tsx',
    ])
      expect(EDITORS.map(rel)).toContain(f)
  })

  it('admin, speaker submit/edit, own-proposal and workshop flows never read the public CFP', () => {
    expect(EDITORS.filter((p) => PUBLIC.test(read(p))).map(rel)).toEqual([])
  })

  it('every public CFP reader uses the public one', () => {
    for (const f of [
      'src/app/(main)/cfp/page.tsx',
      'src/app/(main)/program/page.tsx',
      'src/app/(main)/speaker/[slug]/page.tsx',
    ])
      expect(read(join(ROOT, f)), f).toMatch(PUBLIC)
  })

  it('no public page asks for topics with the bare flag', () => {
    const offenders = ['src/app/(main)', 'src/app/(stream)', 'src/app/(public)']
      .flatMap((d) => files(join(ROOT, d)))
      .filter((p) =>
        /^\s*topics:\s*true\b|\{\s*topics:\s*true\b/m.test(read(p)),
      )
      .map(rel)
    expect(offenders).toEqual([])
  })
})
