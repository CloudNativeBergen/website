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
    // The id is FROZEN at `identity-brand` even though brand and theming now
    // live in their own section (`/admin/settings/appearance`). A fragment never
    // reaches the server, so an anchor cannot be redirected — keeping the id is
    // the only way existing `#identity-brand` deep links stay valid. The group
    // still holds the Appearance summary card that links onward.
    id: 'identity-brand',
    navLabel: 'Identity',
    title: 'Identity',
    description:
      'Name, location, venue and whether this edition is publicly listed. Brand, theme and homepage live under Appearance.',
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
    description: 'Registration and the ticketing provider.',
  },
  {
    id: 'team-content',
    navLabel: 'Team & Content',
    title: 'Team & Content',
    description:
      'Organizers, teams, contact channels, domains and topics/formats.',
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
