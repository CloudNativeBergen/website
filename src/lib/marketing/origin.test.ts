import { describe, it, expect } from 'vitest'
import {
  BLANK_ORIGIN,
  copyTemplateVersion,
  originLabel,
  originStructureSentence,
  planOrigin,
} from './origin'

describe('planOrigin', () => {
  it('reads each stored origin', () => {
    expect(planOrigin('blank')).toEqual({ type: 'blank' })
    expect(planOrigin('2026.1')).toEqual({ type: 'builtin', version: '2026.1' })
    expect(planOrigin('copy:marketingPlan.conf-2026')).toEqual({
      type: 'copy',
      planId: 'marketingPlan.conf-2026',
    })
  })

  it('reads a missing or unreadable origin as unknown, never as a Template', () => {
    expect(planOrigin('')).toEqual({ type: 'unknown' })
    expect(planOrigin('template:abc@3')).toEqual({ type: 'unknown' })
    expect(originLabel('template:abc@3')).toBeNull()
    expect(planOrigin(null)).toEqual({ type: 'unknown' })
    expect(planOrigin(undefined)).toEqual({ type: 'unknown' })
  })

  it('round-trips what the writers store', () => {
    expect(planOrigin(BLANK_ORIGIN)).toEqual({ type: 'blank' })
    expect(planOrigin(copyTemplateVersion('marketingPlan.x'))).toEqual({
      type: 'copy',
      planId: 'marketingPlan.x',
    })
  })
})

describe('originLabel', () => {
  it('names where the plan came from', () => {
    expect(originLabel('blank')).toBe('Started blank')
    expect(originLabel('2026.1')).toBe('Built-in Template 2026.1')
    expect(originLabel('copy:p', 'Cloud Native Bergen 2026')).toBe(
      'Copied from Cloud Native Bergen 2026',
    )
    expect(originLabel('copy:p', null)).toBe('Copied from a previous edition')
  })

  it('says nothing for an unknown origin rather than "Template "', () => {
    expect(originLabel('')).toBeNull()
    expect(originLabel(null)).toBeNull()
  })
})

describe('originStructureSentence', () => {
  it('never mentions a template for a blank plan', () => {
    for (const edited of [false, true]) {
      const sentence = originStructureSentence('blank', edited)
      expect(sentence).toMatch(/blank/)
      expect(sentence).not.toMatch(/template|seed/i)
    }
    expect(originStructureSentence('blank', false)).toMatch(
      /nothing has been added yet/,
    )
    expect(originStructureSentence('blank', true)).toMatch(
      /everything in it has been added since/,
    )
  })

  it('speaks of the Template for a seeded plan and of the copy for a copied one', () => {
    expect(originStructureSentence('2026.1', false)).toMatch(/Template/)
    expect(originStructureSentence('2026.1', true)).toMatch(/since seeding/)
    expect(originStructureSentence('copy:p', false)).toMatch(/copied from/)
    expect(originStructureSentence('copy:p', true)).toMatch(/since copying/)
    expect(originStructureSentence('copy:p', true)).not.toMatch(/template/i)
  })

  it('claims no source for an unknown origin', () => {
    expect(originStructureSentence('', false)).toBe(
      'Campaign structure is unchanged since this plan was created.',
    )
    expect(originStructureSentence('', true)).toBe(
      'Campaigns or Tasks have been added, edited or removed since this plan was created.',
    )
  })
})
