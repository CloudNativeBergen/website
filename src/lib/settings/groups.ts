/**
 * Information architecture for the admin Settings page (tier 1: Configuration).
 *
 * The ~19 read-only configuration cards are organised into a handful of labelled
 * subsections, ordered by an organizer's mental model ("where would I look for
 * X?"). This module is the single source of truth for those group anchors and
 * their headings so the page body and the sticky jump-nav can never drift apart,
 * and so the anchor set is unit-testable in isolation.
 *
 * These group anchors are ADDITIVE — the per-card deep-link anchors (e.g.
 * `#visibility`) and the three tier anchors (`#configuration`, `#system-status`,
 * `#self-check`) are preserved elsewhere and must keep working.
 */

export interface SettingsGroup {
  /** Stable anchor id (used as `#id` deep link and `scroll-mt` target). */
  id: string
  /** Short label shown in the jump-nav chip. */
  navLabel: string
  /** Heading rendered above the group's card grid. */
  title: string
  /** One-line orientation text under the group heading. */
  description: string
}

/** Tier-level anchors (the three top-level Settings sections). */
export interface SettingsTier {
  id: string
  navLabel: string
}

export const SETTINGS_TIERS: readonly SettingsTier[] = [
  { id: 'configuration', navLabel: 'Configuration' },
  { id: 'system-status', navLabel: 'System status' },
  { id: 'self-check', navLabel: 'Self-check' },
]

/**
 * Tier-1 subsection groups, in display order. Membership (which card lives in
 * which group) is expressed by JSX placement on the settings page; this table
 * owns only the group's identity and heading copy.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'identity-brand',
    navLabel: 'Identity & Brand',
    title: 'Identity & Brand',
    description:
      'Name, location, logos, colours and whether this edition is publicly listed.',
  },
  {
    id: 'schedule',
    navLabel: 'Schedule',
    title: 'Schedule',
    description:
      'Key dates, the CFP timeline and the landing-page announcement.',
  },
  {
    id: 'call-for-papers',
    navLabel: 'Call for Papers',
    title: 'Call for Papers',
    description: 'Submission and revenue targets tracked on the dashboard.',
  },
  {
    id: 'tickets-registration',
    navLabel: 'Tickets & Registration',
    title: 'Tickets & Registration',
    description:
      'Registration, workshop sign-ups, the ticketing provider and homepage stats.',
  },
  {
    id: 'sponsors',
    navLabel: 'Sponsors',
    title: 'Sponsors',
    description:
      'Sponsorship tiers, current sponsors, benefits and the public sponsorship page.',
  },
  {
    id: 'team-content',
    navLabel: 'Team & Content',
    title: 'Team & Content',
    description:
      'Organizers, teams, contact channels, domains, topics/formats and homepage composition.',
  },
]

/** Jump-nav anchors for the tier-1 groups (`#id` hrefs + labels). */
export const SETTINGS_GROUP_ANCHORS: readonly {
  href: string
  label: string
}[] = SETTINGS_GROUPS.map((g) => ({ href: `#${g.id}`, label: g.navLabel }))

/** Jump-nav anchors for the three tiers. */
export const SETTINGS_TIER_ANCHORS: readonly { href: string; label: string }[] =
  SETTINGS_TIERS.map((t) => ({ href: `#${t.id}`, label: t.navLabel }))
