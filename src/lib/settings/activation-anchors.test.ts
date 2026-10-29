import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_GROUPS, SETTINGS_TIERS } from './groups'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('activation checklist anchors', () => {
  it('point at ids that exist on /admin/settings', () => {
    const page = read('src/app/(admin)/admin/settings/page.tsx')
    const ids = new Set([
      ...SETTINGS_GROUPS.map((g) => g.id),
      ...SETTINGS_TIERS.map((t) => t.id),
      ...[...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    ])
    const anchors = [
      ...read('src/lib/settings/activation.ts').matchAll(
        /anchor:\s*'#([^']+)'/g,
      ),
    ].map((m) => m[1])
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.filter((a) => !ids.has(a))).toEqual([])
  })
})
