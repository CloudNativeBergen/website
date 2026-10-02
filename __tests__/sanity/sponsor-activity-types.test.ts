/**
 * The `sponsorActivity.activityType` schema list and the TypeScript
 * `ActivityType` union must agree (#1265, in passing). Three members of the
 * union were written by the CRM before the schema listed them, so Studio
 * showed them as unknown values. Pinned here so the next addition to either
 * side is caught at review.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..')
const schema = readFileSync(
  join(root, 'sanity/schemaTypes/sponsorActivity.ts'),
  'utf8',
)
const types = readFileSync(join(root, 'src/lib/sponsor-crm/types.ts'), 'utf8')

function schemaValues(): string[] {
  const start = schema.indexOf("name: 'activityType'")
  const end = schema.indexOf('layout:', start)
  return [...schema.slice(start, end).matchAll(/value: '([a-z_]+)'/g)].map(
    (m) => m[1],
  )
}

function unionMembers(): string[] {
  const match = types.match(/export type ActivityType =([^=]+?)\n\n/)
  if (!match) throw new Error('ActivityType union not found')
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('sponsorActivity.activityType options match the ActivityType union', () => {
  it('both sides are found (the comparison cannot pass vacuously)', () => {
    expect(schemaValues().length).toBeGreaterThanOrEqual(9)
    expect(unionMembers().length).toBeGreaterThanOrEqual(9)
  })

  it('every union member is a schema option', () => {
    const options = new Set(schemaValues())
    expect(unionMembers().filter((m) => !options.has(m))).toEqual([])
  })

  it('every schema option is a union member', () => {
    const members = new Set(unionMembers())
    expect(schemaValues().filter((v) => !members.has(v))).toEqual([])
  })

  it('lists the three that lagged behind', () => {
    const options = schemaValues()
    for (const v of [
      'signature_status_change',
      'registration_complete',
      'contract_reminder_sent',
    ]) {
      expect(options).toContain(v)
    }
  })
})
