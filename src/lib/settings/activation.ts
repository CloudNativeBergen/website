/**
 * "Get started" activation checklist (onboarding S4).
 *
 * Pure, server-safe AND client-safe derivation of "what do I still need to
 * configure to launch?" for the admin Settings page. Every row is computed from
 * TWO sources:
 *
 *   1. Required-field emptiness on the conference document (pure — no I/O).
 *   2. A SELECTIVE read of the already-built system checks
 *      (`buildSystemChecks`) where a wiring state overlaps launch-readiness
 *      (email delivery, Slack). This module NEVER re-probes — it only inspects
 *      the flat `SystemCheck[]` the caller already assembled.
 *
 * The terminal row is `visibility` ("Go live"), the launch switch itself.
 *
 * IMPORTANT — this module is imported by a Storybook story, so it must stay free
 * of any `server-only` / `next/cache` transitive import. Two tiny pure predicates
 * that would otherwise come from server-only barrels
 * (`@/lib/tickets/provider`, `@/lib/conference/visibility`) are re-expressed
 * inline below; the type it does import is erased at compile time. The two
 * VALUE imports it does keep — the provisioning starter formats and the format
 * title map — are both pure client-safe constants, and importing them beats
 * restating either (a checklist that names a different set than provisioning
 * writes would be worse than no note at all).
 */

import type { SystemCheck } from '@/lib/system-status/types'
import { APPEARANCE_SECTION } from '@/lib/settings/appearance'
import { STARTER_SESSION_FORMATS } from '@/lib/onboarding/create'
import { formats as FORMAT_TITLES } from '@/lib/proposal/types'

/** A single checklist line. */
export interface ActivationRow {
  /** Stable id (test + React key). */
  id: string
  /** Short imperative label ("Set conference dates"). */
  label: string
  /** Whether the requirement is satisfied. */
  done: boolean
  /**
   * Deep-link target: either a same-page anchor already rendered on the Settings
   * page — a group anchor (`#schedule`) or a per-card anchor (`#visibility`) —
   * or an absolute admin path, optionally anchored, to another settings page
   * (`/admin/settings/appearance#logos`). Rows whose editor has moved off the
   * settings page use the path form; the checklist routes them client-side.
   */
  anchor: string
  /** One-line orientation / what to do to satisfy the row. Shown while the row
   * is outstanding; a satisfied row needs no instructions. */
  hint: string
  /**
   * An advisory shown even when the row is DONE — for the case where a
   * requirement is technically satisfied but by something the organizer did not
   * choose (the seeded starter formats), so a bare tick would read as a
   * decision they made. Rare by design: most done rows should say nothing.
   */
  note?: string
  /**
   * Present-but-not-required informational rows (Slack, custom domain). Excluded
   * from the progress numerator/denominator and rendered in a muted style.
   */
  optional?: boolean
}

/** The derived checklist plus its progress rollup. */
export interface ActivationChecklist {
  /** All rows in display order (required first, then optional, `visibility` last). */
  rows: ActivationRow[]
  /** Required rows that are done. */
  done: number
  /** Total required rows (optional rows excluded). */
  required: number
  /** True when every REQUIRED row is done — the card collapses in this state. */
  allDone: boolean
}

/**
 * The narrow slice of the conference document the checklist reads. Deliberately
 * a structural subset of `Conference` (all fields optional) so the page can pass
 * the full document and unit tests can pass a tiny fixture.
 */
export interface ConferenceForActivation {
  title?: string
  organizer?: string
  startDate?: string
  endDate?: string
  cfpStartDate?: string
  cfpEndDate?: string
  topics?: unknown[]
  formats?: unknown[]
  logoBright?: string
  logoDark?: string
  logomarkBright?: string
  logomarkDark?: string
  venueName?: string
  contactEmail?: string
  cfpEmail?: string
  sponsorEmail?: string
  registrationLink?: string
  visibility?: string | null
  domains?: string[]
  // Provider-aware ticketing binding.
  ticketingProvider?: 'checkin' | 'tito' | null
  checkinCustomerId?: number | null
  checkinEventId?: number | null
  titoAccountSlug?: string | null
  titoEventSlug?: string | null
}

export interface ActivationOptions {
  /**
   * The platform's shared base host (e.g. `cloudnativebergen.dev`). When known,
   * the informational "custom domain" row is done once the conference declares a
   * domain that is neither that host nor a subdomain of it. When absent, the row
   * falls back to "more than the single auto-provisioned platform subdomain".
   */
  platformDomainSuffix?: string
}

/** Non-empty string / present number. Trims strings; a 0 id counts as absent. */
function present(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
  return value != null
}

/** A system check is satisfied when the caller already resolved it to `ok`. */
function checkOk(checks: SystemCheck[], id: string): boolean {
  return checks.find((c) => c.id === id)?.status === 'ok'
}

/**
 * Provider-aware ticketing binding. Mirrors `hasTicketingBinding` in
 * `@/lib/tickets/provider` WITHOUT importing that barrel (it pulls in the
 * server-only secret store). Absent provider ⇒ Checkin, the historical default.
 */
export function hasTicketingBinding(c: ConferenceForActivation): boolean {
  if ((c.ticketingProvider ?? 'checkin') === 'tito') {
    return present(c.titoAccountSlug) && present(c.titoEventSlug)
  }
  return present(c.checkinCustomerId) && present(c.checkinEventId)
}

/** "Lightning Talk (10 min), Presentation (25 min) and Presentation (45 min)" —
 * the human titles, from the same map the admin editor and CFP page render, so
 * the checklist can never name a format differently from the surface it links to. */
const starterFormatNames = ((): string => {
  const names = STARTER_SESSION_FORMATS.map((f) => FORMAT_TITLES.get(f) ?? f)
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
})()

/**
 * True when `formats` is EXACTLY the set provisioning seeds — same members, no
 * additions, no removals, no duplicates. DERIVED, never stored: nothing marks a
 * format as a default, so "this list is still the one we wrote" is inferred from
 * the list itself.
 *
 * KNOWN FALSE POSITIVE, accepted: a conference that never saw the starter set —
 * one created before it existed, or one whose organizer independently landed on
 * precisely these three — reads as untouched, so the note claims a provenance
 * that is not true of it. The cost is one line of slightly wrong attribution on
 * a row that is already satisfied, it self-heals on the next edit, and the
 * alternative is a stored "these are the defaults" flag — exactly the state this
 * design exists to avoid. Not worth a schema field.
 */
export function isUntouchedStarterFormatSet(
  formats: unknown[] | undefined,
): boolean {
  if (!Array.isArray(formats)) return false
  // Length is checked against the ARRAY, not the deduplicated set: a list of
  // four with a repeated starter format is something the organizer edited.
  if (formats.length !== STARTER_SESSION_FORMATS.length) return false
  const seen = new Set(formats.map((f) => String(f)))
  return (
    seen.size === STARTER_SESSION_FORMATS.length &&
    STARTER_SESSION_FORMATS.every((f) => seen.has(f))
  )
}

/**
 * True when the conference has a domain BEYOND the auto-provisioned platform
 * subdomain — informational, so this never blocks launch. With a known
 * `platformDomainSuffix`, "custom" = any entry that is neither that host nor a
 * subdomain of it; without one, the honest fallback is "declares more than one
 * domain" (the provisioned subdomain plus at least one the tenant added).
 */
export function hasCustomDomain(
  domains: string[] | undefined,
  platformDomainSuffix?: string,
): boolean {
  const list = (domains ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  if (list.length === 0) return false
  const suffix = platformDomainSuffix?.trim().toLowerCase().replace(/^\.+/, '')
  if (suffix) {
    return list.some((d) => d !== suffix && !d.endsWith(`.${suffix}`))
  }
  return list.length > 1
}

/**
 * Build the ordered activation checklist for a conference.
 *
 * @param conference required-field source (structural subset of `Conference`)
 * @param checks     the already-built `SystemCheck[]` (no re-probing here)
 * @param options    optional platform host for the custom-domain row
 */
export function buildActivationChecklist(
  conference: ConferenceForActivation,
  checks: SystemCheck[] = [],
  options: ActivationOptions = {},
): ActivationChecklist {
  const hasLogo =
    present(conference.logoBright) ||
    present(conference.logoDark) ||
    present(conference.logomarkBright) ||
    present(conference.logomarkDark)

  const provider = conference.ticketingProvider ?? 'checkin'
  const ticketingHint =
    provider === 'tito'
      ? 'Add your Tito account and event slugs.'
      : 'Add your Checkin.no customer and event IDs.'

  // Absent visibility means live (see @/lib/conference/visibility), so a legacy
  // conference reads as already live; a fresh trial edition is created unlisted
  // and stays "to do" until an organizer flips the switch.
  const isLive = conference.visibility !== 'unlisted'

  const rows: ActivationRow[] = [
    {
      id: 'basics',
      label: 'Name & organizer',
      done: present(conference.title) && present(conference.organizer),
      anchor: '#identity-brand',
      hint: 'Set the conference name and the organizing body.',
    },
    {
      id: 'branding-logo',
      label: 'Brand logo',
      done: hasLogo,
      anchor: APPEARANCE_SECTION.logos.href,
      hint: 'Upload a logo so the site and emails carry your brand.',
    },
    {
      id: 'venue',
      label: 'Venue',
      done: present(conference.venueName),
      anchor: '#identity-brand',
      hint: 'Name the venue so attendees know where to go.',
    },
    {
      id: 'dates',
      label: 'Conference dates',
      done: present(conference.startDate) && present(conference.endDate),
      anchor: '#schedule',
      hint: 'Set the start and end dates of the event.',
    },
    {
      id: 'cfp-window',
      label: 'Call-for-papers window',
      done: present(conference.cfpStartDate) && present(conference.cfpEndDate),
      anchor: '#schedule',
      hint: 'Open the CFP by setting its start and end dates.',
    },
    {
      // REQUIRED to submit, not cosmetic: a proposal must carry a format
      // (`validateProposalForm`), and the CFP page only advertises the formats
      // this conference configured. An organizer who empties the list has
      // closed their own CFP, so this stays a launch blocker.
      //
      // A NEW tenant is provisioned WITH the starter set (see
      // @/lib/onboarding/create.ts), so this row starts ticked — correctly: the
      // CFP really can accept proposals. The `note` keeps that tick honest by
      // saying whose choice it was, since a bare strike-through would read as
      // "you picked these".
      id: 'formats',
      label: 'Session formats',
      done: Array.isArray(conference.formats) && conference.formats.length > 0,
      anchor: '#team-content',
      hint: 'Choose at least one session format speakers may submit (talks, workshops).',
      ...(isUntouchedStarterFormatSet(conference.formats)
        ? {
            note: `We started you off with ${starterFormatNames} — edit them to match your programme.`,
          }
        : {}),
    },
    {
      id: 'topics',
      label: 'At least one topic',
      done: Array.isArray(conference.topics) && conference.topics.length > 0,
      anchor: '#team-content',
      hint: 'Add topics so speakers can categorise their proposals.',
    },
    {
      id: 'emails',
      label: 'Contact, CFP & sponsor emails',
      done:
        present(conference.contactEmail) &&
        present(conference.cfpEmail) &&
        present(conference.sponsorEmail),
      anchor: '#team-content',
      hint: 'Set the contact, CFP and sponsor email addresses.',
    },
    {
      id: 'registration',
      label: 'Registration link',
      done: present(conference.registrationLink),
      anchor: '#tickets-registration',
      hint: 'Link out to where attendees buy tickets or register.',
    },
    {
      id: 'ticketing',
      label: 'Ticketing connected',
      done: hasTicketingBinding(conference),
      anchor: '#tickets-registration',
      hint: ticketingHint,
    },
    {
      // Reused from the system checks — email delivery is a hard launch
      // requirement (its check reports `error` when unset).
      id: 'email-delivery',
      label: 'Email delivery configured',
      done: checkOk(checks, 'email.resendKey'),
      anchor: '#system-status',
      hint: 'Configure the Resend API key so outbound email can send.',
    },
    {
      // Reused from the system checks — Slack is an optional integration (its
      // check reports `off`, not `error`, when unset).
      id: 'slack',
      label: 'Slack notifications',
      done: checkOk(checks, 'slack.botToken'),
      anchor: '#system-status',
      hint: 'Optional: connect Slack to receive CFP and sales notifications.',
      optional: true,
    },
    {
      id: 'custom-domain',
      label: 'Custom domain',
      done: hasCustomDomain(conference.domains, options.platformDomainSuffix),
      anchor: '#team-content',
      hint: 'Optional: point your own domain at the site once you are ready.',
      optional: true,
    },
    // TERMINAL ROW — the launch switch, always last so it reads as the finish
    // line. FUTURE: the paid-activation / billing gate (a "Complete payment"
    // step) will slot in immediately BEFORE this row once CaaS billing lands.
    {
      id: 'visibility',
      label: 'Go live',
      done: isLive,
      anchor: '#visibility',
      hint: isLive
        ? 'This edition is publicly listed and indexed.'
        : 'Flip visibility to Live to publish and index the site.',
    },
  ]

  const requiredRows = rows.filter((r) => !r.optional)
  const done = requiredRows.filter((r) => r.done).length

  return {
    rows,
    done,
    required: requiredRows.length,
    allDone: done === requiredRows.length,
  }
}
