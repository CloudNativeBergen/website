/**
 * "Get started" activation checklist (onboarding S4).
 *
 * Pure, server-safe AND client-safe derivation of "what do I still need to
 * configure to launch?" — rendered as a card on the admin Settings page and as
 * the activation hero on `/admin` itself. Every row is computed from THREE
 * sources:
 *
 *   1. Required-field emptiness on the conference document (pure — no I/O).
 *   2. A SELECTIVE read of the already-built system checks
 *      (`buildSystemChecks`) where a wiring state overlaps launch-readiness
 *      (email delivery, Slack). This module NEVER re-probes — it only inspects
 *      the flat `SystemCheck[]` the caller already assembled.
 *   3. {@link ActivationOptions} — the caller's already-resolved answers to the
 *      two questions this module cannot ask without a server import: is this
 *      tenant entitled to ticketing, and does it even own the email key. See
 *      "rows the organizer cannot complete" below.
 *
 * ── TWO STAGES, NOT ONE FLAT LIST ──────────────────────────────────────────
 *
 * Rows carry a {@link ActivationStage}, and the order is stage-major:
 *
 *   `cfp`    — the CFP window plus the two things `canAcceptProposals`
 *              (`@/lib/conference/state`) actually requires: formats and
 *              topics. Nothing else stops a speaker submitting, so nothing
 *              else belongs here.
 *   `launch` — everything the public site wants before it is published,
 *              terminating in `visibility` ("Go live"), the switch itself.
 *
 * The split exists because the hero on `/admin` names the organizer's NEXT
 * step, and "next" is only meaningful against a critical path. A flat list in
 * settings-card order would have opened a fresh tenant's onboarding with
 * "Brand logo" while its CFP sat closed.
 *
 * ── ROWS THE ORGANIZER CANNOT COMPLETE (#839) ──────────────────────────────
 *
 * A checklist containing steps the user cannot complete teaches the user to
 * ignore the checklist, so two rows are conditionally NOT theirs to do:
 * `ticketing` for an org without the entitlement, and `email-delivery` for a
 * tenant on the shared platform, whose Resend key is a platform environment
 * variable it can neither see nor set. Both are marked
 * {@link ActivationRow.unavailable} — still listed, so the surface is not
 * silently missing, but excluded from the progress rollup and never offered as
 * a next step. The caller resolves both booleans (see
 * `@/lib/settings/activation-server`); this module stays pure.
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

/**
 * Which half of activation a row belongs to. `cfp` is the critical path to a
 * CFP that can actually receive a proposal; `launch` is everything the public
 * site wants before it goes live. See the module header.
 */
export type ActivationStage = 'cfp' | 'launch'

/** Display metadata for one stage — the heading the card and the hero share. */
export interface ActivationStageMeta {
  id: ActivationStage
  /** Imperative heading ("Open your call for papers"). */
  title: string
  /** One line saying what being short of this stage costs the organizer. */
  description: string
}

/** The stages in order. The first one with outstanding work is "what's next". */
export const ACTIVATION_STAGES: readonly ActivationStageMeta[] = [
  {
    id: 'cfp',
    title: 'Open your call for papers',
    description:
      'Until these are set a speaker cannot submit a proposal at all.',
  },
  {
    id: 'launch',
    title: 'Get ready to launch',
    description:
      'The rest of the setup, ending with the switch that publishes your site.',
  },
]

/**
 * The id of the terminal row — the launch switch. Excluded from
 * {@link ActivationChecklist.readyToGoLive} because that flag exists to answer
 * "may this organizer flip the switch yet?", and the switch cannot be its own
 * precondition.
 */
export const ACTIVATION_LAUNCH_ROW_ID = 'visibility'

/**
 * The DOM id the full checklist card carries on the Settings page, and the
 * href that lands on it. Single-sourced here so the `/admin` hero and the
 * unlisted banner cannot drift from the anchor the card actually renders
 * (`ActivationChecklist.tsx`) — the bug #839 opens on, where "Go live" pointed
 * at `#visibility`, an anchor BELOW the checklist.
 */
export const ACTIVATION_CHECKLIST_ANCHOR = 'get-started'
export const ACTIVATION_CHECKLIST_HREF = `/admin/settings#${ACTIVATION_CHECKLIST_ANCHOR}`

/** A single checklist line. */
export interface ActivationRow {
  /** Stable id (test + React key). */
  id: string
  /** Which stage the row belongs to; also fixes its position in `rows`. */
  stage: ActivationStage
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
  /**
   * Set when the row is NOT this organizer's to complete — the string is the
   * short badge text saying why ("Not on your plan", "Platform-managed").
   *
   * Excluded from the progress rollup exactly like `optional`, and never
   * returned by {@link nextActivationSteps}: a checklist that asks for
   * something the user cannot do teaches them to ignore the checklist (#839).
   * Distinct from `optional`, which is a real choice they declined; this is an
   * absence of agency, and the two must not read the same.
   */
  unavailable?: string
}

/** One stage's rows plus its own rollup. */
export interface ActivationStageGroup extends ActivationStageMeta {
  /** The stage's rows in display order. */
  rows: ActivationRow[]
  /** Required rows in this stage that are done. */
  done: number
  /** Total required rows in this stage. */
  required: number
  /** True when every required row in this stage is done. */
  allDone: boolean
}

/** The derived checklist plus its progress rollup. */
export interface ActivationChecklist {
  /** All rows in display order (stage-major; `visibility` always last). */
  rows: ActivationRow[]
  /** The same rows grouped by stage, in stage order. */
  stages: ActivationStageGroup[]
  /** Required rows that are done. */
  done: number
  /** Total required rows (optional and unavailable rows excluded). */
  required: number
  /** True when every REQUIRED row is done — the card collapses in this state. */
  allDone: boolean
  /**
   * Every required row EXCEPT the terminal launch switch is done: the
   * conference is ready to be published. This — not `allDone` — is what the
   * unlisted banner keys on, because an unlisted conference by definition has
   * the `visibility` row outstanding, so `allDone` would be false forever and
   * the banner could never graduate from "Finish setup" to "Go live".
   */
  readyToGoLive: boolean
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
  /**
   * Whether this tenant may use the ticketing surfaces at all (#828/#834 —
   * `isTicketingEnabledForOrg`). `false` turns the `ticketing` row into an
   * unavailable one: an org without the entitlement has no way to make those
   * ids work, so counting them as a launch blocker asks for the impossible.
   *
   * DEFAULTS TO TRUE — "we did not resolve it" must not hide a step the tenant
   * can in fact take. Only a resolved, negative answer demotes the row.
   */
  ticketingAvailable?: boolean
  /**
   * Whether outbound email is sent with the PLATFORM's credentials rather than
   * this tenant's own. `true` turns `email-delivery` into an unavailable row:
   * `RESEND_API_KEY` is a deployment environment variable, so on the shared
   * platform the row was telling every tenant to configure a secret it cannot
   * see, let alone set.
   *
   * DEFAULTS TO FALSE — the single-tenant / self-hosted deployment, where the
   * organizer IS the operator and the key really is theirs to set.
   */
  emailDeliveryManagedByPlatform?: boolean
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

  // Ticketing is gated per organization (#828/#834). Only a RESOLVED "no"
  // demotes the row — see `ActivationOptions.ticketingAvailable`.
  const ticketingAvailable = options.ticketingAvailable !== false
  const emailManagedByPlatform = options.emailDeliveryManagedByPlatform === true

  // STAGE 1 — the CFP critical path, and nothing else. Membership is not a
  // matter of taste: `canAcceptProposals` (@/lib/conference/state) is formats
  // AND topics, and `isCfpOpen` is the window. Those three predicates are what
  // the public CFP page and both submit routes actually enforce, so those three
  // rows are what stands between a new tenant and a proposal in the inbox.
  // Dates, branding and venue deliberately sit in `launch`: a CFP with "dates
  // TBA" is a normal conference, a CFP with no topics is a broken form.
  const cfpRows: ActivationRow[] = [
    {
      id: 'cfp-window',
      stage: 'cfp',
      label: 'Call-for-papers window',
      done: present(conference.cfpStartDate) && present(conference.cfpEndDate),
      anchor: '#schedule',
      hint: 'Open the CFP by setting its start and end dates.',
    },
    {
      id: 'topics',
      stage: 'cfp',
      label: 'At least one topic',
      done: Array.isArray(conference.topics) && conference.topics.length > 0,
      anchor: '#team-content',
      hint: 'Add topics so speakers can categorise their proposals.',
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
      stage: 'cfp',
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
  ]

  // STAGE 2 — everything the published site wants, terminating in the switch.
  const launchRows: ActivationRow[] = [
    {
      id: 'basics',
      stage: 'launch',
      label: 'Name & organizer',
      done: present(conference.title) && present(conference.organizer),
      anchor: '#identity-brand',
      hint: 'Set the conference name and the organizing body.',
    },
    {
      id: 'dates',
      stage: 'launch',
      label: 'Conference dates',
      done: present(conference.startDate) && present(conference.endDate),
      anchor: '#schedule',
      hint: 'Set the start and end dates of the event.',
    },
    {
      id: 'venue',
      stage: 'launch',
      label: 'Venue',
      done: present(conference.venueName),
      anchor: '#identity-brand',
      hint: 'Name the venue so attendees know where to go.',
    },
    {
      id: 'branding-logo',
      stage: 'launch',
      label: 'Brand logo',
      done: hasLogo,
      anchor: APPEARANCE_SECTION.logos.href,
      hint: 'Upload a logo so the site and emails carry your brand.',
    },
    {
      id: 'emails',
      stage: 'launch',
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
      stage: 'launch',
      label: 'Registration link',
      done: present(conference.registrationLink),
      anchor: '#tickets-registration',
      hint: 'Link out to where attendees buy tickets or register.',
    },
    {
      // ENTITLEMENT-AWARE (#839). Without the `ticketing` entitlement there are
      // no credentials to resolve against (#820/#828), so however many ids the
      // organizer types the surface stays unusable — a hard-required row they
      // could never tick.
      id: 'ticketing',
      stage: 'launch',
      label: 'Ticketing connected',
      done: hasTicketingBinding(conference),
      anchor: '#tickets-registration',
      hint: ticketingAvailable
        ? ticketingHint
        : 'Ticketing is not part of your plan, so there is nothing to connect here.',
      ...(ticketingAvailable ? {} : { unavailable: 'Not on your plan' }),
    },
    {
      // Reused from the system checks — email delivery is a hard launch
      // requirement (its check reports `error` when unset) WHEREVER the key is
      // the organizer's to set. On the shared platform it is not: the key is a
      // deployment environment variable, so the row becomes informational and
      // says who owns it instead of asking for something impossible (#839).
      id: 'email-delivery',
      stage: 'launch',
      label: 'Email delivery configured',
      done: checkOk(checks, 'email.resendKey'),
      anchor: '#system-status',
      hint: emailManagedByPlatform
        ? 'Outbound email is sent for you on the platform account — there is no key here for you to set.'
        : 'Configure the Resend API key so outbound email can send.',
      ...(emailManagedByPlatform ? { unavailable: 'Platform-managed' } : {}),
    },
    {
      // Reused from the system checks — Slack is an optional integration (its
      // check reports `off`, not `error`, when unset).
      id: 'slack',
      stage: 'launch',
      label: 'Slack notifications',
      done: checkOk(checks, 'slack.botToken'),
      anchor: '#system-status',
      hint: 'Optional: connect Slack to receive CFP and sales notifications.',
      optional: true,
    },
    {
      id: 'custom-domain',
      stage: 'launch',
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
      id: ACTIVATION_LAUNCH_ROW_ID,
      stage: 'launch',
      label: 'Go live',
      done: isLive,
      anchor: '#visibility',
      hint: isLive
        ? 'This edition is publicly listed and indexed.'
        : 'Flip visibility to Live to publish and index the site.',
    },
  ]

  const rows = [...cfpRows, ...launchRows]
  const requiredRows = rows.filter(isRequired)
  const done = requiredRows.filter((r) => r.done).length

  const stages: ActivationStageGroup[] = ACTIVATION_STAGES.map((meta) => {
    const stageRows = rows.filter((r) => r.stage === meta.id)
    const stageRequired = stageRows.filter(isRequired)
    const stageDone = stageRequired.filter((r) => r.done).length
    return {
      ...meta,
      rows: stageRows,
      done: stageDone,
      required: stageRequired.length,
      allDone: stageDone === stageRequired.length,
    }
  })

  return {
    rows,
    stages,
    done,
    required: requiredRows.length,
    allDone: done === requiredRows.length,
    readyToGoLive: requiredRows
      .filter((r) => r.id !== ACTIVATION_LAUNCH_ROW_ID)
      .every((r) => r.done),
  }
}

/**
 * A row that counts toward progress: the organizer's to do, and possible for
 * them to do. `optional` and `unavailable` are excluded for different reasons
 * (a declined choice vs. no agency) but share this consequence.
 */
function isRequired(row: ActivationRow): boolean {
  return !row.optional && !row.unavailable
}

/**
 * The outstanding required rows to put in front of the organizer RIGHT NOW —
 * the hero on `/admin` renders exactly this.
 *
 * Drawn from the FIRST stage with outstanding work and never spilling into the
 * next one: the hero titles itself with that stage, so mixing in a launch row
 * under "Open your call for papers" would misfile it. `unavailable` and
 * `optional` rows can never appear here — that is the whole point of both
 * flags.
 */
export function nextActivationSteps(
  checklist: ActivationChecklist,
  limit = 2,
): ActivationRow[] {
  const stage = checklist.stages.find((s) => !s.allDone)
  if (!stage) return []
  return stage.rows.filter((r) => isRequired(r) && !r.done).slice(0, limit)
}

/** The stage the organizer is currently working through, or `null` when done. */
export function currentActivationStage(
  checklist: ActivationChecklist,
): ActivationStageGroup | null {
  return checklist.stages.find((s) => !s.allDone) ?? null
}
