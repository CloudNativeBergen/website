import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { PresentationChartBarIcon } from '@heroicons/react/24/outline'
import {
  ADMIN_DESTINATIONS,
  ADMIN_NAV_SECTIONS,
  scoreDestination,
  searchDestinations,
  visibleDestinations,
  visibleNavSections,
  withNavBadges,
  type AdminNavSection,
} from './registry'
import { SETTINGS_GROUPS, SETTINGS_TIERS } from '@/lib/settings/groups'
import { APPEARANCE_SECTIONS } from '@/lib/settings/appearance'
import { FEATURE_IDS, type FeatureId } from '@/lib/features/registry'

describe('admin destination registry', () => {
  it('hides Marketing Report from the sidebar while preserving its destination and PDF search result', () => {
    const navHrefs = visibleNavSections([...FEATURE_IDS]).flatMap((section) =>
      section.items.map((item) => item.href),
    )
    expect(navHrefs).not.toContain('/admin/marketing/report')

    const expected = {
      id: 'marketing-report',
      title: 'Marketing Report',
      href: '/admin/marketing/report',
      group: 'Events & Content',
      keywords: ['report', 'campaigns', 'outcomes', 'snapshots', 'pdf', 'csv'],
      icon: PresentationChartBarIcon,
      kind: 'page',
    }
    expect(
      ADMIN_DESTINATIONS.find((d) => d.href === expected.href),
    ).toStrictEqual(expected)
    expect(
      searchDestinations('pdf', ADMIN_DESTINATIONS).flatMap((g) => g.items),
    ).toContainEqual(expected)
  })

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
    // Exactly the tagged nav entries — nothing untagged may go missing.
    expect(hidden.map((item) => item.href).sort()).toEqual([
      '/admin/tickets',
      '/admin/workshops',
    ])
  })

  /**
   * TICKETS (the demo-org audit): every provider-backed ticketing destination
   * disappears for an org with no ticketing integration, so an organizer is
   * never pointed at five pages that can only tell them they cannot use them.
   */
  it('hides the tickets nav entry and its provider-backed sub-pages', () => {
    const items = visibleNavSections([]).flatMap((s) => s.items)
    expect(items.map((item) => item.href)).not.toContain('/admin/tickets')

    const hrefs = visibleDestinations([]).map((d) => d.href)
    for (const href of [
      '/admin/tickets',
      '/admin/tickets/orders',
      '/admin/tickets/types',
      '/admin/tickets/discount',
      '/admin/tickets/companies',
    ]) {
      expect(hrefs).not.toContain(href)
    }
  })

  it('shows every ticketing destination once the org is entitled', () => {
    const hrefs = visibleDestinations(['ticketing']).map((d) => d.href)
    for (const href of [
      '/admin/tickets',
      '/admin/tickets/orders',
      '/admin/tickets/types',
      '/admin/tickets/discount',
      '/admin/tickets/companies',
    ]) {
      expect(hrefs).toContain(href)
    }
  })

  /**
   * The ticket PAGE CONTENT editor is deliberately ungated: it edits the public
   * /tickets page copy out of Sanity and touches no provider, so it must stay
   * reachable for a tenant that has no ticketing integration.
   */
  it('keeps the tickets page-content editor available without ticketing', () => {
    expect(visibleDestinations([]).map((d) => d.href)).toContain(
      '/admin/tickets/content',
    )
  })

  /** BADGES: issuance refuses any non-platform org (RunKonf/platform#46). */
  it('hides the speaker badges destination without the badges feature', () => {
    expect(visibleDestinations([]).map((d) => d.href)).not.toContain(
      '/admin/speakers/badge',
    )
    expect(visibleDestinations(['badges']).map((d) => d.href)).toContain(
      '/admin/speakers/badge',
    )
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
    const tagged = ADMIN_DESTINATIONS.filter((d) => d.feature)
    // Every gated destination is dropped for an org with no features, and
    // exactly those — the untagged majority is never touched.
    expect(visibleDestinations([]).length).toBe(
      ADMIN_DESTINATIONS.length - tagged.length,
    )
    const everyFeature = [
      ...new Set(tagged.map((d) => d.feature!)),
    ] as FeatureId[]
    expect(visibleDestinations(everyFeature).length).toBe(
      ADMIN_DESTINATIONS.length,
    )
  })

  it('tags a destination only with a real registry feature id', () => {
    for (const destination of ADMIN_DESTINATIONS) {
      if (destination.feature) {
        expect(FEATURE_IDS).toContain(destination.feature)
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

  it('finds individual settings cards and links to their anchor', () => {
    const flat = searchDestinations('posthog').flatMap((g) => g.items)
    const card = flat.find((d) => d.id === 'settings-analytics')
    expect(card?.href).toBe('/admin/settings#analytics')
  })

  it('only links to settings anchors the settings page actually renders', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(admin)/admin/settings/page.tsx'),
      'utf8',
    )
    const groupOrTier = new Set(
      [...SETTINGS_GROUPS, ...SETTINGS_TIERS].map((x) => x.id),
    )
    const cardIds = ADMIN_DESTINATIONS.map(
      (d) => d.href.match(/^\/admin\/settings#([a-z0-9-]+)$/)?.[1],
    ).filter((id): id is string => !!id && !groupOrTier.has(id))
    expect(cardIds.length).toBeGreaterThan(10)
    for (const id of cardIds) {
      expect(page, `#${id} missing on the page`).toContain(`id="${id}"`)
    }
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

describe('Session Feedback nav entry (speaker feedback spec §10.1)', () => {
  it('sits right after Proposals, for every organization, and is ⌘K-searchable', () => {
    const items = visibleNavSections([]).flatMap((s) => s.items)
    const at = items.findIndex((i) => i.href === '/admin/feedback')
    expect(items[at]?.name).toBe('Session Feedback')
    expect(items[at - 1]?.name).toBe('Proposals')
    expect(searchDestinations('session feedback')[0]?.items[0]?.href).toBe(
      '/admin/feedback',
    )
  })
})

/** The nav entry at `href`. */
const entry = (sections: readonly AdminNavSection[], href: string) =>
  sections.flatMap((s) => s.items).find((item) => item.href === href)

describe('nav badges (speaker feedback spec §10.1)', () => {
  it('puts the flagged count on Session Feedback, labelled for a screen reader', () => {
    const sections = withNavBadges(visibleNavSections([]), {
      flaggedFeedback: 3,
    })
    expect(entry(sections, '/admin/feedback')?.badge).toEqual({
      count: 3,
      label: 'flagged',
    })
    // On that entry only.
    expect(
      sections.flatMap((s) => s.items).filter((item) => item.badge),
    ).toHaveLength(1)
  })

  it('shows no badge for 0 or an unknown count', () => {
    for (const counts of [{ flaggedFeedback: 0 }, {}]) {
      expect(
        entry(withNavBadges(visibleNavSections([]), counts), '/admin/feedback')
          ?.badge,
      ).toBeUndefined()
    }
  })

  it('leaves the registry itself untouched', () => {
    withNavBadges(ADMIN_NAV_SECTIONS, { flaggedFeedback: 3 })
    expect(entry(ADMIN_NAV_SECTIONS, '/admin/feedback')?.badge).toBeUndefined()
  })
})

describe('Photo Wall nav badge (Photo Wall spec §10, P6)', () => {
  it('puts the pending count on Photo Wall, labelled for a screen reader', () => {
    const sections = withNavBadges(visibleNavSections([]), {
      pendingWallPosts: 4,
    })
    expect(entry(sections, '/admin/photo-wall')?.badge).toEqual({
      count: 4,
      label: 'pending',
    })
    expect(
      sections.flatMap((s) => s.items).filter((item) => item.badge),
    ).toHaveLength(1)
  })

  it('keeps each count on its own entry', () => {
    const sections = withNavBadges(visibleNavSections([]), {
      flaggedFeedback: 3,
      pendingWallPosts: 4,
    })
    expect(entry(sections, '/admin/feedback')?.badge).toEqual({
      count: 3,
      label: 'flagged',
    })
    expect(entry(sections, '/admin/photo-wall')?.badge).toEqual({
      count: 4,
      label: 'pending',
    })
  })

  it('shows no badge for 0 or a count that did not arrive', () => {
    for (const counts of [{ pendingWallPosts: 0 }, {}]) {
      expect(
        entry(
          withNavBadges(visibleNavSections([]), counts),
          '/admin/photo-wall',
        )?.badge,
      ).toBeUndefined()
    }
  })
})
