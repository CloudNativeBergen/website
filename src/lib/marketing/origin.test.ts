import { describe, it, expect } from 'vitest'
import {
  BLANK_ORIGIN,
  copyTemplateVersion,
  originLabel,
  originStructureSentence,
  planOrigin,
  templateOrigin,
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

  it('reads a missing or unreadable origin as unknown, never guessing a source', () => {
    expect(planOrigin('')).toEqual({ type: 'unknown' })
    expect(planOrigin('mystery:abc@3')).toEqual({ type: 'unknown' })
    expect(originLabel('mystery:abc@3')).toBeNull()
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

describe('an organization Template origin (Templates spec §2.3)', () => {
  it('stamps name and version as text, and reads them back', () => {
    const stored = templateOrigin('Our playbook', 3)
    expect(stored).toBe('template:Our playbook@3')
    expect(planOrigin(stored)).toEqual({
      type: 'template',
      name: 'Our playbook',
      version: 3,
    })
    expect(originLabel(stored)).toBe('Template “Our playbook”, version 3')
  })
  it('cannot be mistaken for another origin, whatever the Template is called', () => {
    expect(planOrigin(templateOrigin('blank', 1))).toMatchObject({
      type: 'template',
      name: 'blank',
    })
    expect(planOrigin(templateOrigin('2027.1', 2))).toMatchObject({
      type: 'template',
      name: '2027.1',
    })
    expect(planOrigin(templateOrigin('me@work', 12))).toEqual({
      type: 'template',
      name: 'me@work',
      version: 12,
    })
  })
  it('reads a stamp without a usable version as unknown rather than guessing', () => {
    expect(planOrigin('template:Ours')).toEqual({ type: 'unknown' })
    expect(planOrigin('template:Ours@x')).toEqual({ type: 'unknown' })
    expect(planOrigin('template:@1')).toEqual({ type: 'unknown' })
  })
  it('words the structure sentence for a Template', () => {
    expect(originStructureSentence(templateOrigin('Ours', 1), false)).toBe(
      'Campaign structure still matches the Template it was seeded from.',
    )
    expect(originStructureSentence(templateOrigin('Ours', 1), true)).toContain(
      'since seeding',
    )
  })
})
