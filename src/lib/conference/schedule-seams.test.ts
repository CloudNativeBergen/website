/**
 * @vitest-environment node
 *
 * Which schedule a caller gets is decided by the function it imports (#1772):
 * getPublicSchedule (the API for apiRead tenants: no talk `_id` on TBA slots,
 * no `_rev` or `status` on days) or getEditableSchedule (always Sanity).
 * Admin surfaces and the schedule editor must only ever use the editable one,
 * and no page may ask for the schedule through the bare `schedule: true` flag.
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

/** Admin surfaces and the editors: the editable schedule only. */
const EDITORS = [
  'src/app/(admin)',
  'src/components/admin',
  'src/lib/schedule',
  'src/lib/dashboard',
].flatMap((d) => files(join(ROOT, d)))

describe('schedule seams', () => {
  it('scans the admin and editor trees', () => {
    expect(EDITORS.length).toBeGreaterThan(50)
    expect(EDITORS.map(rel)).toContain('src/app/(admin)/admin/actions.ts')
  })

  it('admin surfaces and editors never import the public schedule', () => {
    const offenders = EDITORS.filter((p) =>
      /\bgetPublicSchedule\w*\b/.test(read(p)),
    ).map(rel)
    expect(offenders).toEqual([])
  })

  it('the admin surfaces that read the schedule use the editable one', () => {
    for (const f of [
      'src/app/(admin)/admin/actions.ts',
      'src/app/(admin)/admin/page.tsx',
      'src/app/(admin)/admin/photo-wall/render.tsx',
      'src/app/(admin)/admin/settings/appearance/composer/page.tsx',
      'src/app/(admin)/admin/settings/page.tsx',
      'src/app/(admin)/admin/settings/appearance/page.tsx',
      'src/lib/schedule/server.ts',
    ])
      expect(read(join(ROOT, f)), f).toMatch(/\bgetEditableSchedule\w*\b/)
  })

  it('no page asks for the schedule with the bare flag', () => {
    const offenders = files(join(ROOT, 'src/app'))
      .filter((p) => /^\s*schedule:\s*true\b/m.test(read(p)))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
