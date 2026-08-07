/**
 * THE tenant-conditional SUBPROCESSOR DISCLOSURE for /privacy and /terms (#690).
 *
 * WHY THIS EXISTS. The processor list on the privacy page was hardcoded JSX,
 * served identically on every tenant domain. A tenant selling through Tito was
 * telling its attendees that Checkin.no processes their data; a tenant that does
 * not run workshops was disclosing WorkOS as processing attendee email, name and
 * user ID. That is not a copy bug: the page is a legal representation by the
 * TENANT (they are the controller named on it), and the subprocessor list is the
 * first thing a customer's DPA review reads.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO RULES, AND THEY OUTRANK THE MECHANISM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. NEVER UNDER-REPORT. Omitting a processor a tenant actually uses is the
 *    failure with legal consequence; naming one it does not is a copy problem.
 *    So every signal is THREE-STATE — `yes` / `no` / UNKNOWN — and an unknown
 *    DISCLOSES the processor, marked `certainty: 'possible'`, rather than
 *    dropping it. Only a signal that positively answers "no" from a SUCCESSFUL
 *    read removes an entry.
 *
 * 2. A FAILED READ MUST NOT SHORTEN THE LIST. This is the #855/#848 class
 *    applied to the worst possible surface. Almost every feature gate in this
 *    codebase fails CLOSED on a rejected Sanity read — `resolveRegistryEntitlement`
 *    answers `'denied'`, `resolveEnabledFeaturesForOrg` logs "treating every
 *    feature as DISABLED" — which is the right posture for handing out a
 *    credential and exactly the WRONG one for a disclosure. Deriving this list
 *    straight from those gates would mean a flaky read silently publishes a
 *    SHORTER subprocessor list during an outage. So the resolver probes the
 *    organization read for health FIRST (`./subprocessors.resolve`) and reports
 *    `organizationReadFailed`, which turns every org-gated signal UNKNOWN
 *    instead of "no".
 *
 * FAILURE BEHAVIOUR CHOSEN, deliberately, out of the two honest options
 * ("show the full possible set" vs "show an error"): SHOW THE FULL POSSIBLE SET,
 * with a conspicuous notice saying which parts could not be confirmed. A privacy
 * policy is where a data subject finds the controller's contact address and how
 * to exercise their rights — content that does not depend on any of these reads.
 * Replacing the page with an error during a partial outage removes that, to fix
 * nothing. (A failure of the CONFERENCE read is different and IS an error state:
 * with no conference document there is no controller to name either, so the page
 * has nothing truthful left to say — see the pages' own `isConferenceUnavailable`
 * branch.)
 *
 * PURE — no I/O — so every disclosure rule is unit-testable in isolation. The
 * signal GATHERING lives in `./subprocessors.resolve` (server-only).
 */

/** Every processor this platform can place in a tenant's processing chain. */
export type SubprocessorId =
  | 'sanity'
  | 'vercel'
  | 'resend'
  | 'checkin'
  | 'tito'
  | 'pirsch'
  | 'slack'
  | 'oauth-providers'
  | 'workos'

/**
 * How sure we are that THIS tenant uses the processor.
 *
 * - `confirmed` — a successful read says this tenant uses it.
 * - `possible`  — we could NOT determine it. Disclosed anyway (rule 1); the page
 *                 must render the uncertainty rather than presenting it as fact.
 */
export type DisclosureCertainty = 'confirmed' | 'possible'

/** A three-state answer about one signal. UNKNOWN is not "no". */
export type Signal = 'yes' | 'no' | 'unknown'

export interface DisclosedSubprocessor {
  id: SubprocessorId
  name: string
  /** What the processor does with personal data. */
  purpose: string
  /** Which heading it renders under. */
  group: 'infrastructure' | 'authentication'
  /**
   * Processing location, disclosed only where it is outside the EU/EEA and so
   * drives the international-transfer section.
   */
  location?: string
  /**
   * Who put this processor in the chain: the PLATFORM (shared infrastructure the
   * tenant did not choose) or the ORGANIZER (a vendor they selected). The
   * distinction is what a DPA review is actually asking about.
   */
  chosenBy: 'platform' | 'organizer'
  certainty: DisclosureCertainty
  /** Extra clause appended after the purpose (e.g. which Resend account). */
  detail?: string
}

export interface SubprocessorDisclosure {
  processors: DisclosedSubprocessor[]
  /**
   * True when at least one entry is `possible` — i.e. something could not be
   * determined and the list may name a processor this tenant does not use. The
   * page MUST say so; a silently over-long list read as fact is its own
   * inaccuracy.
   */
  incomplete: boolean
}

type CatalogueEntry = Omit<DisclosedSubprocessor, 'certainty' | 'detail'>

/**
 * The catalogue. One place where a processor's name, purpose and location are
 * written down, so the "removal checklist" in #690 is a single edit: dropping a
 * vendor platform-wide means deleting its entry here, and every disclosure
 * surface follows.
 */
export const SUBPROCESSOR_CATALOGUE: Record<SubprocessorId, CatalogueEntry> = {
  sanity: {
    id: 'sanity',
    name: 'Sanity.io',
    purpose: 'Content management and database services (EU-based)',
    group: 'infrastructure',
    chosenBy: 'platform',
  },
  vercel: {
    id: 'vercel',
    name: 'Vercel.com',
    purpose:
      'Website hosting, infrastructure, content delivery, file storage for uploaded attachments, and privacy-friendly analytics (Vercel Analytics & Speed Insights; cookie-less)',
    group: 'infrastructure',
    chosenBy: 'platform',
    location: 'United States',
  },
  resend: {
    id: 'resend',
    name: 'Resend.com',
    purpose: 'Email delivery for conference communications',
    group: 'infrastructure',
    chosenBy: 'platform',
    location: 'United States',
  },
  checkin: {
    id: 'checkin',
    name: 'Checkin.no',
    purpose: 'Ticket sales, ticket management and event check-in',
    group: 'infrastructure',
    chosenBy: 'organizer',
  },
  tito: {
    id: 'tito',
    name: 'Tito (ti.to)',
    purpose: 'Ticket sales, ticket management and event check-in',
    group: 'infrastructure',
    chosenBy: 'organizer',
  },
  pirsch: {
    id: 'pirsch',
    name: 'Pirsch Analytics',
    purpose:
      'Privacy-focused, cookie-less website analytics (aggregated, no advertising profiles)',
    group: 'infrastructure',
    chosenBy: 'organizer',
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    purpose:
      'Internal organizer notifications for operations (e.g., speaker proposal updates)',
    group: 'infrastructure',
    chosenBy: 'organizer',
    location: 'United States',
  },
  'oauth-providers': {
    id: 'oauth-providers',
    name: 'GitHub/LinkedIn',
    purpose:
      'Authentication for the Call for Papers (when you choose to sign in)',
    group: 'authentication',
    chosenBy: 'platform',
  },
  workos: {
    id: 'workos',
    name: 'WorkOS (AuthKit)',
    purpose:
      'User authentication and identity management for workshop signups (email, name, user ID, authentication sessions)',
    group: 'authentication',
    chosenBy: 'platform',
    location: 'United States',
  },
}

/** The order entries render in, per group. */
const DISCLOSURE_ORDER: readonly SubprocessorId[] = [
  'sanity',
  'vercel',
  'resend',
  'checkin',
  'tito',
  'pirsch',
  'slack',
  'oauth-providers',
  'workos',
]

/**
 * The facts a disclosure is built from. Everything nullable here means "could
 * not be determined", which is a DIFFERENT value from `false` — see rule 2.
 */
export interface TenantProcessingFacts {
  /**
   * False when nothing about this tenant could be read at all (no conference
   * document). Every tenant-conditional signal then resolves UNKNOWN.
   */
  tenantKnown: boolean
  /**
   * True when the ORGANIZATION document read FAILED. Every org-gated signal
   * (Slack, workshops/WorkOS) then resolves UNKNOWN rather than inheriting the
   * gates' fail-closed `false`.
   */
  organizationReadFailed: boolean
  /** The conference's ticketing selection + binding, or `null` when unknown. */
  ticketing: TicketingFacts | null
  /**
   * The RAW `conference.analyticsPirschCode`. Deliberately raw and not passed
   * through `resolvePirschCode`: a MALFORMED code serves no script, but
   * validating here would DROP the disclosure on a typo, which is the
   * under-report direction. A non-empty value discloses Pirsch.
   */
  analyticsCode?: string | null
  /** Whether a Slack bot token resolves for this conference. `null` = unknown. */
  slackToken: boolean | null
  /** Whether workshops (and so WorkOS AuthKit) are enabled. `null` = unknown. */
  workshops: boolean | null
  /**
   * Whether the organizer sends through ITS OWN Resend account rather than the
   * shared platform account. `null` = unknown. Resend is disclosed either way —
   * this only changes WHICH account, which is the part a DPA cares about.
   */
  dedicatedEmailAccount: boolean | null
}

export interface TicketingFacts {
  /** The vendor the conference resolves to (absent selection ⇒ Checkin). */
  provider: 'checkin' | 'tito'
  /** True when the conference carries the FULL binding for that vendor. */
  bound: boolean
  /** True when `ticketingProvider` is set explicitly on the document. */
  explicitlySelected: boolean
  /** The organizer's external registration URL, if any. */
  registrationLink?: string | null
}

/** Vendor domains recognised in an organizer's external registration link. */
const REGISTRATION_LINK_VENDORS: ReadonlyArray<{
  id: 'checkin' | 'tito'
  hosts: readonly string[]
}> = [
  { id: 'checkin', hosts: ['checkin.no'] },
  { id: 'tito', hosts: ['ti.to', 'tito.io'] },
]

/**
 * Which vendor an organizer's `registrationLink` points at, or `null`.
 *
 * THIS IS A PROXY, NOT A FACT, and it is used only to move a signal from "no" to
 * UNKNOWN — never to assert use. A conference can sell through a vendor we have
 * no integration with: we then share nothing with that vendor ourselves, but the
 * ORGANIZER (the controller this page speaks for) plainly does, and a policy that
 * stayed silent would under-report. Matching the link's host is the cheapest
 * signal available for that, so it earns a `possible`, not a `confirmed`.
 */
export function registrationLinkVendor(
  link: string | null | undefined,
): 'checkin' | 'tito' | null {
  const trimmed = link?.trim()
  if (!trimmed) return null
  let host: string
  try {
    host = new URL(trimmed).hostname.toLowerCase()
  } catch {
    return null
  }
  for (const vendor of REGISTRATION_LINK_VENDORS) {
    if (vendor.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return vendor.id
    }
  }
  return null
}

/** `yes` when true, `no` when false, `unknown` when null/undefined. */
function fromNullableBoolean(value: boolean | null | undefined): Signal {
  if (value === null || value === undefined) return 'unknown'
  return value ? 'yes' : 'no'
}

/**
 * The ticketing signal for ONE vendor.
 *
 * A COMPLETE binding for that vendor is the only `yes`: it is what makes the
 * platform call the vendor's API with attendee data. An explicit selection with
 * an INCOMPLETE binding, or an external registration link pointing at the vendor,
 * is `unknown` — the organizer has demonstrably chosen it, so silence would
 * under-report, but we cannot say the integration is live. Everything else is a
 * genuine `no` derived from a successful read: an unbound conference shares no
 * attendee data with any ticketing vendor through us.
 */
export function ticketingSignal(
  vendor: 'checkin' | 'tito',
  ticketing: TicketingFacts | null,
): Signal {
  if (!ticketing) return 'unknown'
  if (ticketing.bound && ticketing.provider === vendor) return 'yes'
  if (ticketing.explicitlySelected && ticketing.provider === vendor) {
    return 'unknown'
  }
  if (registrationLinkVendor(ticketing.registrationLink) === vendor) {
    return 'unknown'
  }
  return 'no'
}

/** The three-state signal for every processor, derived from the facts. */
export function subprocessorSignals(
  facts: TenantProcessingFacts,
): Record<SubprocessorId, Signal> {
  // With no tenant document nothing tenant-specific is knowable. Note this is
  // NOT the same as the tenant using nothing.
  const orgUnknowable = !facts.tenantKnown || facts.organizationReadFailed
  const orgSignal = (value: boolean | null): Signal =>
    orgUnknowable ? 'unknown' : fromNullableBoolean(value)

  const analytics: Signal = !facts.tenantKnown
    ? 'unknown'
    : facts.analyticsCode?.trim()
      ? 'yes'
      : 'no'

  return {
    // Shared platform infrastructure. Every tenant's data passes through these
    // whatever they configure, so they are unconditional — and honestly labelled
    // `chosenBy: 'platform'` rather than implied to be the tenant's choice.
    sanity: 'yes',
    vercel: 'yes',
    resend: 'yes',
    'oauth-providers': 'yes',

    checkin: facts.tenantKnown
      ? ticketingSignal('checkin', facts.ticketing)
      : 'unknown',
    tito: facts.tenantKnown
      ? ticketingSignal('tito', facts.ticketing)
      : 'unknown',
    pirsch: analytics,
    slack: orgSignal(facts.slackToken),
    workos: orgSignal(facts.workshops),
  }
}

/**
 * Build the disclosure. `yes` → confirmed, `unknown` → possible (rule 1),
 * `no` → omitted.
 */
export function buildSubprocessorDisclosure(
  facts: TenantProcessingFacts,
): SubprocessorDisclosure {
  const signals = subprocessorSignals(facts)
  const processors: DisclosedSubprocessor[] = []

  for (const id of DISCLOSURE_ORDER) {
    const signal = signals[id]
    if (signal === 'no') continue
    processors.push({
      ...SUBPROCESSOR_CATALOGUE[id],
      certainty: signal === 'yes' ? 'confirmed' : 'possible',
      detail: id === 'resend' ? emailAccountDetail(facts) : undefined,
    })
  }

  return {
    processors,
    incomplete: processors.some((p) => p.certainty === 'possible'),
  }
}

/**
 * Which Resend account the organizer's mail goes through. A tenant with its own
 * key in the secret store contracts with Resend directly; on the shared account
 * the platform is the contracting party. Unknown → no clause rather than a
 * guess.
 */
function emailAccountDetail(facts: TenantProcessingFacts): string | undefined {
  if (facts.dedicatedEmailAccount === null) return undefined
  return facts.dedicatedEmailAccount
    ? 'Sent through this organizer’s own Resend account.'
    : 'Sent through the shared platform sending account.'
}

/** Whether a processor appears in the disclosure at all (confirmed OR possible). */
export function discloses(
  disclosure: SubprocessorDisclosure,
  id: SubprocessorId,
): boolean {
  return disclosure.processors.some((p) => p.id === id)
}

/**
 * The disclosed processors that process outside the EU/EEA — what the
 * international-transfer section must name. Derived from the SAME list, so it
 * cannot drift from it (naming WorkOS as a US transfer on a tenant that never
 * uses WorkOS was the same defect one section further down the page).
 */
export function internationalTransferProcessors(
  disclosure: SubprocessorDisclosure,
): DisclosedSubprocessor[] {
  return disclosure.processors.filter((p) => p.location)
}
