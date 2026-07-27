import { describe, it, expect } from 'vitest'
import {
  ADMIN_DESTINATIONS,
  ADMIN_NAV_SECTIONS,
  scoreDestination,
  searchDestinations,
} from './registry'
import { SETTINGS_GROUPS, SETTINGS_TIERS } from '@/lib/settings/groups'

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
        expect(destination.href.startsWith('/admin/settings#')).toBe(true)
      }
    }
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
