import { describe, it, expect } from 'vitest'
import {
  SETTINGS_GROUPS,
  SETTINGS_TIERS,
  SETTINGS_GROUP_ANCHORS,
  SETTINGS_TIER_ANCHORS,
} from './groups'

describe('settings IA groups', () => {
  it('defines the five organizer-facing groups in order', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual([
      'identity-brand',
      'schedule',
      'call-for-papers',
      'tickets-registration',
      'team-content',
    ])
  })

  it('gives every group a title, nav label and description', () => {
    for (const g of SETTINGS_GROUPS) {
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.navLabel.length).toBeGreaterThan(0)
      expect(g.description.length).toBeGreaterThan(0)
    }
  })

  it('has unique group ids that never collide with tier or per-card anchors', () => {
    const groupIds = SETTINGS_GROUPS.map((g) => g.id)
    expect(new Set(groupIds).size).toBe(groupIds.length)

    const tierIds = SETTINGS_TIERS.map((t) => t.id)
    // Preserved per-card deep-link anchors that must not be shadowed by a group.
    const reserved = new Set([...tierIds, 'visibility'])
    for (const id of groupIds) {
      expect(reserved.has(id)).toBe(false)
    }
  })

  it('produces well-formed jump-nav anchors for tiers and groups', () => {
    for (const a of [...SETTINGS_TIER_ANCHORS, ...SETTINGS_GROUP_ANCHORS]) {
      expect(a.href.startsWith('#')).toBe(true)
      expect(a.href.length).toBeGreaterThan(1)
      expect(a.label.length).toBeGreaterThan(0)
    }
  })

  it('derives group anchors 1:1 from the group ids', () => {
    expect(SETTINGS_GROUP_ANCHORS.map((a) => a.href)).toEqual(
      SETTINGS_GROUPS.map((g) => `#${g.id}`),
    )
  })

  it('keeps the three tiers stable', () => {
    expect(SETTINGS_TIERS.map((t) => t.id)).toEqual([
      'configuration',
      'system-status',
      'self-check',
    ])
  })
})
