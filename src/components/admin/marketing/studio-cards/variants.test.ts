import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPONSOR_CARD_VARIANTS } from './variants'

describe('SPONSOR_CARD_VARIANTS module', () => {
  it('is importable from a server component: no client directive, a real array', () => {
    const source = readFileSync(join(__dirname, 'variants.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*['"]use client['"]/m)
    expect(SPONSOR_CARD_VARIANTS.length).toBe(6)
    expect(SPONSOR_CARD_VARIANTS[7 % SPONSOR_CARD_VARIANTS.length]).toBe(
      'cloud-wizards',
    )
  })
})
