/**
 * Pure targeting + value derivation for the conference identity backfill.
 *
 * Kept separate from `index.ts` (which owns the Sanity I/O) so the two things
 * that can silently go wrong — WHICH document gets patched, and WHAT value is
 * written — are unit-testable without a dataset. `plan.test.ts` is the net.
 *
 * THE VALUES ARE HARDCODED ON PURPOSE. Every literal below is the value the
 * platform's CURRENT fallback produces, captured on 2026-08-03 and verified
 * against the live sites. They are deliberately NOT imported from
 * `@/lib/branding/theme` / `@/lib/conference/backgroundPattern`: the entire
 * point of this migration is that those constants are about to be neutralised
 * toward Konf, and a migration that read them would then write the NEW default
 * and destroy the thing it exists to preserve. `plan.test.ts` asserts the
 * literals still equal the code constants today — a tripwire, not a coupling.
 */

import { domainServesHost } from '@/lib/conference/domains'
import {
  LEGACY_BERGEN_LOGO_SVG,
  LEGACY_BERGEN_LOGOMARK_SVG,
} from './legacy-brand'

// ---------------------------------------------------------------------------
// House values — what the code fallbacks render TODAY
// ---------------------------------------------------------------------------

/**
 * `DEFAULT_PRIMARY_COLOR` / `DEFAULT_ACCENT_COLOR` in `src/lib/branding/theme.ts`,
 * i.e. the `var(--brand-primary, #1d4ed8)` / `var(--brand-accent, #06b6d4)`
 * fallbacks in `src/styles/tailwind.css`. Also the `theme_color` served in the
 * live PWA manifest of all three editions (`#1D4ED8`), which is how we know no
 * conference currently stores a theme.
 */
export const HOUSE_THEME = {
  primaryColor: '#1D4ED8',
  accentColor: '#06B6D4',
} as const

/**
 * `DEFAULT_BACKGROUND_PATTERN` in `src/lib/conference/backgroundPattern.ts` —
 * the animated CNCF project logos an absent `backgroundPattern` resolves to.
 */
export const HOUSE_BACKGROUND_PATTERN = 'cloud-native'

/**
 * The eight `sponsorshipCustomization` strings `SponsorProspectus` falls back to
 * (src/components/sponsor/SponsorProspectus.tsx:54-72), quoted verbatim. All
 * eight are visible on the live `/sponsor` page of every edition today, except
 * `heroHeadline` on Cloud Native Days Norway 2026, which already stores its own
 * — the reason this migration merges per key instead of writing the object.
 */
export const HOUSE_SPONSORSHIP_COPY: Readonly<Record<string, string>> = {
  heroHeadline: 'No Sales Pitches. Just Code & Culture.',
  heroSubheadline:
    'We prioritize engineering value over marketing fluff. Our audience builds the platforms Norway runs on. Join us in powering the voyage.',
  packageSectionTitle: 'The Base Image',
  addonSectionTitle: 'Custom Resource Definitions (CRDs)',
  philosophyTitle: "We Don't Sell Booths. We Build Credibility.",
  philosophyDescription:
    "We intentionally do not have a traditional Expo Hall. Why? Because the best engineers don't like being sold to in a booth. Instead, we integrate your brand into the fabric of the event through digital hype, on-site signage, and our curated 'Wall of Opportunities'.",
  closingQuote:
    "The best engineers don't apply to job ads; they work for companies they respect.",
  closingCtaText: 'git commit -m "Support the Community"',
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** One conference edition this migration is allowed to touch. */
export interface TargetSpec {
  /**
   * The edition's canonical routing host. Targeting is by ROUTING IDENTITY, not
   * by title or by document order: a conference is the target iff one of its
   * `domains[]` entries would serve this host, using the exact predicate the
   * site's router uses (`domainServesHost`).
   */
  host: string
  /** Human label for the log. Never used for matching. */
  label: string
  /**
   * Restore the pre-#703 default logo (the Cloud Native Bergen mark) into the
   * `logoBright` / `logomarkBright` slots when they are EMPTY.
   *
   * True only for the two Bergen editions, which rendered that exact mark until
   * #703 deleted it. False for Cloud Native Days Norway 2026: it uploaded its
   * OWN logo, and stamping the Bergen mark into its empty `logomarkBright` slot
   * would put another edition's brand on its PWA icon.
   */
  restoreLegacyLogo: boolean
}

export const TARGETS: readonly TargetSpec[] = [
  {
    host: '2026.cloudnativedays.no',
    label: 'Cloud Native Days Norway 2026',
    restoreLegacyLogo: false,
  },
  {
    host: '2025.cloudnativebergen.dev',
    label: 'Cloud Native Day Bergen 2025',
    restoreLegacyLogo: true,
  },
  {
    host: '2024.cloudnativebergen.dev',
    label: 'Cloud Native Day Bergen 2024',
    restoreLegacyLogo: true,
  },
]

// ---------------------------------------------------------------------------
// Document shape (only the fields this migration reads)
// ---------------------------------------------------------------------------

export interface ConferenceIdentityDoc {
  _id: string
  title?: string | null
  domains?: string[] | null
  theme?: { primaryColor?: string | null; accentColor?: string | null } | null
  backgroundPattern?: string | null
  logoBright?: string | null
  logomarkBright?: string | null
  sponsorshipCustomization?: Record<string, unknown> | null
  homepageSections?: unknown[] | null
}

/** A single field this migration would write, with its provenance for the log. */
export interface PlannedSet {
  /** Top-level document field. Never a dotted path — see `index.ts`. */
  path:
    | 'theme'
    | 'backgroundPattern'
    | 'logoBright'
    | 'logomarkBright'
    | 'sponsorshipCustomization'
  value: unknown
  /** One-line reason, printed by the dry run. */
  reason: string
}

/** A non-fatal observation the dry run should surface to the operator. */
export type PlanNote = string

/**
 * "This field holds nothing." ONLY null/undefined and whitespace-only strings
 * qualify.
 *
 * A non-string value is emphatically NOT blank. Reading it as blank would have
 * broken the migration's central promise — a `theme.primaryColor` stored as a
 * number, or a `logoBright` stored as an image reference by some future schema
 * revision, is a value a human put there, and this migration would have
 * silently overwritten it with the Cloud Native default. Wrong-typed data is a
 * job for schema validation, not for a backfill to paper over.
 */
const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '')

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * The only fields TARGETING reads. Kept separate from
 * {@link ConferenceIdentityDoc} so the pre-pass query can project just these —
 * the identity fields include two ~19KB inline SVGs, and fetching those for
 * every conference in the dataset only to compare `domains[]` is pure waste.
 */
export type ConferenceTargetDoc = Pick<
  ConferenceIdentityDoc,
  '_id' | 'title' | 'domains'
>

export interface ResolvedTarget {
  spec: TargetSpec
  doc: ConferenceTargetDoc
}

export interface Resolution {
  resolved: ResolvedTarget[]
  /** Non-empty means ABORT — a target is missing or ambiguous. */
  errors: string[]
}

/**
 * Match every {@link TARGETS} entry to exactly one conference document.
 *
 * FAILS LOUDLY rather than guessing: zero matches or more than one match for a
 * target is an error, and the caller aborts the whole migration. A migration
 * that patched "whatever it found" would be indistinguishable from one that
 * patched the wrong tenant.
 */
export function resolveTargets(
  docs: readonly ConferenceTargetDoc[],
  targets: readonly TargetSpec[] = TARGETS,
): Resolution {
  const resolved: ResolvedTarget[] = []
  const errors: string[] = []

  for (const spec of targets) {
    const matches = docs.filter((doc) =>
      (doc.domains ?? []).some((entry) => domainServesHost(entry, spec.host)),
    )

    if (matches.length === 0) {
      errors.push(
        `No conference has a domains[] entry serving "${spec.host}" (${spec.label}). ` +
          `Refusing to guess which document this is.`,
      )
      continue
    }
    if (matches.length > 1) {
      errors.push(
        `${matches.length} conferences claim "${spec.host}" (${spec.label}): ` +
          `${matches.map((m) => m._id).join(', ')}. Refusing to patch an ambiguous target.`,
      )
      continue
    }

    resolved.push({ spec, doc: matches[0] })
  }

  // A document matched by two different targets means the domain list is not
  // the identity we think it is — abort rather than write two editions' worth
  // of values onto one document.
  const seen = new Map<string, string>()
  for (const { spec, doc } of resolved) {
    const previous = seen.get(doc._id)
    if (previous) {
      errors.push(
        `Conference ${doc._id} matched both "${previous}" and "${spec.host}". ` +
          `Refusing to patch one document as two editions.`,
      )
    }
    seen.set(doc._id, spec.host)
  }

  return { resolved, errors }
}

// ---------------------------------------------------------------------------
// Value derivation
// ---------------------------------------------------------------------------

/**
 * True when the document already carries a brand theme we must not touch.
 *
 * Either colour counts. A HALF theme (exactly one colour — schema-invalid
 * legacy data) is deliberately treated as "already set": the platform renders
 * a half theme as fully UNTHEMED, so completing it here would change the site's
 * appearance, which is the one thing this migration must never do.
 */
export function hasStoredTheme(doc: ConferenceIdentityDoc): boolean {
  return !isBlank(doc.theme?.primaryColor) || !isBlank(doc.theme?.accentColor)
}

/**
 * Merge the house sponsorship copy UNDER whatever the document already stores.
 * Returns `null` when nothing would change (every key already present), which
 * is what makes a re-run a no-op.
 */
export function mergeSponsorshipCopy(
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const current = existing ?? {}
  const merged: Record<string, unknown> = { ...current }
  let changed = false

  for (const [key, value] of Object.entries(HOUSE_SPONSORSHIP_COPY)) {
    if (isBlank(current[key])) {
      merged[key] = value
      changed = true
    }
  }

  return changed ? merged : null
}

/**
 * The complete, ordered list of writes for one target. ONLY fields that are
 * absent are included, so a second run of the same plan yields an empty list.
 */
export function planSets(
  doc: ConferenceIdentityDoc,
  spec: TargetSpec,
): PlannedSet[] {
  const sets: PlannedSet[] = []

  if (!hasStoredTheme(doc)) {
    sets.push({
      path: 'theme',
      value: { ...HOUSE_THEME },
      reason:
        'no stored theme — pinning the house palette the CSS fallbacks render today',
    })
  }

  if (isBlank(doc.backgroundPattern)) {
    sets.push({
      path: 'backgroundPattern',
      value: HOUSE_BACKGROUND_PATTERN,
      reason:
        'absent — pinning the CNCF-logo background an absent value renders',
    })
  }

  if (spec.restoreLegacyLogo) {
    if (isBlank(doc.logoBright)) {
      sets.push({
        path: 'logoBright',
        value: LEGACY_BERGEN_LOGO_SVG,
        reason:
          'empty — restoring the Cloud Native Bergen wordmark this edition rendered until #703',
      })
    }
    if (isBlank(doc.logomarkBright)) {
      sets.push({
        path: 'logomarkBright',
        value: LEGACY_BERGEN_LOGOMARK_SVG,
        reason:
          'empty — restoring the Cloud Native Bergen icon mark (header, OG image, PWA icon)',
      })
    }
  }

  const sponsorship = mergeSponsorshipCopy(doc.sponsorshipCustomization)
  if (sponsorship) {
    sets.push({
      path: 'sponsorshipCustomization',
      value: sponsorship,
      reason:
        'pinning the prospectus copy the component falls back to (existing keys preserved)',
    })
  }

  return sets
}

/**
 * Things the operator must know about but this migration deliberately does NOT
 * write. Surfaced by the dry run so the manual follow-up list is generated from
 * the real dataset rather than from an assumption.
 */
export function planNotes(
  doc: ConferenceIdentityDoc,
  spec: TargetSpec,
): PlanNote[] {
  const notes: PlanNote[] = []

  if (
    !Array.isArray(doc.homepageSections) ||
    doc.homepageSections.length === 0
  ) {
    notes.push(
      'homepageSections is absent — the homepage renders getDefaultSections(), which is ' +
        'PHASE-AWARE (a published schedule swaps Featured Speakers for Program Highlights). ' +
        'Materialising it here would freeze that choice, so the house section copy ' +
        '("fueling the cluster…", "Relive the energy…") is NOT backfilled. MANUAL: configure ' +
        'the copy through the admin homepage editor if those defaults are ever neutralised.',
    )
  }

  if (!spec.restoreLegacyLogo && isBlank(doc.logomarkBright)) {
    notes.push(
      'logomarkBright is empty and this edition has its OWN uploaded logo, so the legacy ' +
        'Bergen mark is NOT stamped here. MANUAL: upload a square mark in ' +
        'Admin → Settings → Branding, otherwise the PWA icon and any mark-variant surface ' +
        'render a generated monogram from the conference title.',
    )
  }

  if (hasStoredTheme(doc)) {
    notes.push(
      'a theme is already stored — left untouched (this migration never overwrites).',
    )
  }

  return notes
}
