import { describe, it, expect } from 'vitest'
import {
  ADMIN_DESTINATIONS,
  ADMIN_NAV_SECTIONS,
  scoreDestination,
  searchDestinations,
  visibleDestinations,
  visibleNavSections,
} from './registry'
import { SETTINGS_GROUPS, SETTINGS_TIERS } from '@/lib/settings/groups'
import { APPEARANCE_SECTIONS } from '@/lib/settings/appearance'

describe('admin destination registry', () => {
  it('has globally unique destination ids', () => {
    const ids = ADMIN_DESTINATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has globally unique hrefs', () => {
    const hrefs = ADMIN_DESTINATIONS.map((d) => d.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('has well-formed hrefs (admin path with optional anchor)', () => {
    for (const destination of ADMIN_DESTINATIONS) {
      expect(destination.href).toMatch(/^\/admin(\/[a-z0-9-]+)*(#[a-z0-9-]+)?$/)
    }
  })

  it('gives every destination a title, group, kind and keywords', () => {
    for (const destination of ADMIN_DESTINATIONS) {
      expect(destination.title.length).toBeGreaterThan(0)
      expect(destination.group.length).toBeGreaterThan(0)
      expect(['page', 'setting', 'action']).toContain(destination.kind)
      expect(destination.keywords.length).toBeGreaterThan(0)
    }
  })

  it('covers every sidebar nav entry as a page destination', () => {
    const pageHrefs = new Set(
      ADMIN_DESTINATIONS.filter((d) => d.kind === 'page').map((d) => d.href),
    )
    for (const section of ADMIN_NAV_SECTIONS) {
      for (const item of section.items) {
        expect(pageHrefs).toContain(item.href)
      }
    }
  })

  it('covers every settings group anchor as a setting destination', () => {
    const settingHrefs = new Set(
      ADMIN_DESTINATIONS.filter((d) => d.kind === 'setting').map((d) => d.href),
    )
    for (const group of SETTINGS_GROUPS) {
      expect(settingHrefs).toContain(`/admin/settings#${group.id}`)
    }
    for (const tier of SETTINGS_TIERS.filter((t) => t.id !== 'configuration')) {
      expect(settingHrefs).toContain(`/admin/settings#${tier.id}`)
    }
  })

  it('anchors only appear on settings hrefs', () => {
    for (const destination of ADMIN_DESTINATIONS) {
      if (destination.href.includes('#')) {
        // The settings page's own group/tier anchors, and the Appearance
        // page's section anchors — no other admin page is anchor-addressable.
        expect(destination.href).toMatch(
          /^\/admin\/settings(\/appearance)?#[a-z0-9-]+$/,
        )
      }
    }
  })

  it('links every Appearance section to an anchor on the one page', () => {
    for (const section of APPEARANCE_SECTIONS) {
      const destination = ADMIN_DESTINATIONS.find(
        (d) => d.id === `settings-appearance-${section.id}`,
      )
      expect(destination?.href).toBe(`/admin/settings/appearance#${section.id}`)
      expect(destination?.kind).toBe('setting')
    }
  })
})

/**
 * Feature-gated destinations (#689): an org that is not entitled must not see
 * the entry in the sidebar OR find it in ⌘K — the two surfaces filter through
 * the same helpers so they can never drift.
 */
describe('feature-gated destinations', () => {
  it('hides the workshops nav entry from an org without the feature', () => {
    const sections = visibleNavSections([])
    const items = sections.flatMap((section) => section.items)
    expect(items.map((item) => item.href)).not.toContain('/admin/workshops')
  })

  it('shows it again once the org is entitled', () => {
    const items = visibleNavSections(['workshops']).flatMap((s) => s.items)
    expect(items.map((item) => item.href)).toContain('/admin/workshops')
  })

  it('keeps every ungated entry visible either way', () => {
    const gated = visibleNavSections([]).flatMap((s) => s.items)
    const all = ADMIN_NAV_SECTIONS.flatMap((s) => s.items)
    const hidden = all.filter((item) => !gated.includes(item))
    expect(hidden.map((item) => item.href)).toEqual(['/admin/workshops'])
  })

  it('drops the workshops destination from ⌘K search results', () => {
    const withFeature = searchDestinations(
      'workshops',
      visibleDestinations(['workshops']),
    ).flatMap((g) => g.items)
    expect(withFeature.map((d) => d.id)).toContain('workshops')

    const without = searchDestinations(
      'workshops',
      visibleDestinations([]),
    ).flatMap((g) => g.items)
    expect(without.map((d) => d.id)).not.toContain('workshops')
  })

  it('drops no ungated destination', () => {
    expect(visibleDestinations([]).length).toBe(ADMIN_DESTINATIONS.length - 1)
    expect(visibleDestinations(['workshops']).length).toBe(
      ADMIN_DESTINATIONS.length,
    )
  })
})

describe('searchDestinations', () => {
  it('returns every destination grouped for an empty query (browse mode)', () => {
    const groups = searchDestinations('')
    const flat = groups.flatMap((g) => g.items)
    expect(flat.length).toBe(ADMIN_DESTINATIONS.length)
    expect(new Set(flat.map((d) => d.id))).toEqual(
      new Set(ADMIN_DESTINATIONS.map((d) => d.id)),
    )
    expect(groups.map((g) => g.group)).toEqual([
      'Core',
      'People',
      'Events & Content',
      'System',
      'Settings',
    ])
  })

  it('ranks a title prefix match first', () => {
    const groups = searchDestinations('dash')
    expect(groups[0].items[0].id).toBe('dashboard')
  })

  it('finds settings sections via synonyms', () => {
    const flat = searchDestinations('tito').flatMap((g) => g.items)
    expect(flat.map((d) => d.id)).toContain('settings-tickets-registration')

    const checkin = searchDestinations('checkin').flatMap((g) => g.items)
    expect(checkin.map((d) => d.id)).toContain('settings-tickets-registration')
  })

  it('matches subsequences for fuzzy queries', () => {
    const flat = searchDestinations('spnsr').flatMap((g) => g.items)
    expect(flat.map((d) => d.id)).toContain('sponsors')
  })

  it('returns no groups when nothing matches', () => {
    expect(searchDestinations('xyzzy-no-such-page')).toEqual([])
  })

  it('scores exact title matches above looser matches', () => {
    const tickets = ADMIN_DESTINATIONS.find((d) => d.id === 'tickets')!
    const orders = ADMIN_DESTINATIONS.find((d) => d.id === 'tickets-orders')!
    const exact = scoreDestination(tickets, 'tickets')
    const loose = scoreDestination(orders, 'tickets')
    expect(loose).toBeGreaterThan(0)
    expect(exact).toBeGreaterThan(loose)
  })
})
