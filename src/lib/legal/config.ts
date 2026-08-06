import { resolveConferenceContact } from '@/lib/email/from'
import type { Conference } from '@/lib/conference/types'

/**
 * Tenant-driven LEGAL identity for the /privacy and /terms pages (go-live gate
 * G2, findings B5/B6). These pages previously hardcoded the Cloud Native Days
 * Norway controller, a Bergen/Norway location, Norwegian tax-law references and
 * Datatilsynet as the supervisory authority — all WRONG for any other tenant.
 *
 * This module resolves ONE `LegalConfig` object from the tenant's organization
 * (preferred) and conference (fallback). It is deliberately variable
 * substitution, NOT a legal-blocks CMS: the page structure and prose stay put,
 * only the org-identity variables and the jurisdiction-specific clauses vary.
 *
 * JURISDICTION IS NEVER GUESSED. It resolves from `organization.legalJurisdiction`
 * then `conference.country`, and if neither is set it is UNRESOLVED — the pages
 * say so conspicuously instead of asserting a country's law. It used to fall
 * back to Norway, which is the one failure mode that must not exist here: a
 * privacy policy that names the wrong supervisory authority, or terms that
 * submit a tenant to the wrong courts, is worse than one that admits the field
 * is unset. `conference.country` is a required schema field, so in practice the
 * unresolved state only appears on a half-configured document.
 *
 * The Norway-specific prose (tax law, "Norwegian data protection laws",
 * Datatilsynet) renders only when the jurisdiction resolves TO Norway.
 *
 * THE CONTROLLER IS NEVER GUESSED EITHER (#848, #690). It used to fall back to
 * `PLATFORM_NAME` when neither the organization document nor the conference
 * named an entity — so a FAILED organization read (which `resolveLegalConfig`
 * could not distinguish from a legitimately absent one) published the PLATFORM
 * as the data controller of a tenant's event. Naming the wrong controller is
 * worse than admitting the field is unresolved: it misdirects every access,
 * erasure and objection request under Articles 15-21, and it is exactly the
 * failure class #855 spent a week removing — a failed read rendered as a
 * confident claim. There is now no platform fallback at all;
 * {@link LegalConfig.controllerResolved} is false and the pages say so.
 */

/** A data-protection supervisory authority a complaint can be lodged with. */
export interface SupervisoryAuthority {
  name: string
  url?: string
  email?: string
}

/** The Norwegian DPA — the default for the existing tenant and any Norway org. */
export const NORWAY_SUPERVISORY_AUTHORITY: SupervisoryAuthority = {
  name: 'Norwegian Data Protection Authority (Datatilsynet)',
  url: 'https://www.datatilsynet.no',
  email: 'postkasse@datatilsynet.no',
}

/**
 * A jurisdiction-neutral authority pointer for non-Norway tenants that have not
 * configured their own DPA. It carries no URL/email — a generic sentence, not a
 * fabricated contact for the wrong country.
 */
export const GENERIC_SUPERVISORY_AUTHORITY: SupervisoryAuthority = {
  name: 'your national or EU/EEA data protection authority',
}

const NORWAY = 'Norway'

/**
 * Restrict an org-managed URL to http(s) before it is rendered as a link.
 * The Sanity field is typed `url`, but the client renders whatever is stored —
 * a `javascript:` (or other scheme) value must never become an executable
 * anchor on the privacy page. Invalid/unsafe values degrade to no link.
 */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? trimmed
      : undefined
  } catch {
    return undefined
  }
}

export interface LegalConfig {
  /**
   * The data controller / legal entity name shown throughout the pages. EMPTY
   * when no entity could be resolved — pages MUST branch on
   * {@link LegalConfig.controllerResolved} and never print a blank or a
   * substitute.
   */
  controllerName: string
  /**
   * False when neither the organization document nor the conference named a
   * legal entity. There is deliberately NO fallback: see the module doc.
   */
  controllerResolved: boolean
  /**
   * True when the organization document read FAILED (as opposed to a tenant
   * that legitimately has no organization document). The identity below may
   * then be a degraded conference-level fallback, or absent entirely, and the
   * pages must say the details could not be confirmed rather than presenting
   * them as current.
   */
  identityReadFailed: boolean
  /** The controller's contact address for privacy / terms enquiries. */
  contactEmail: string
  /**
   * Human location line for the controller, e.g. "Bergen, Norway". EMPTY when
   * nothing can be said truthfully — callers must omit the "based in …" clause
   * rather than print a blank.
   */
  location: string
  /**
   * Country whose law governs (terms) and whose tax law is referenced. EMPTY
   * when neither the org nor the conference declares one — see
   * {@link LegalConfig.jurisdictionConfigured}.
   */
  jurisdiction: string
  /**
   * False when no jurisdiction could be resolved. Pages MUST branch on this and
   * render a visible "not configured" notice; they must never fill the gap with
   * a default country.
   */
  jurisdictionConfigured: boolean
  /** True when the jurisdiction is Norway → render Norway-specific prose. */
  isNorway: boolean
  /** The DPA a data-subject complaint is lodged with. */
  supervisoryAuthority: SupervisoryAuthority
}

/** The org legal fields projected from the `organization` document. */
export interface OrganizationLegalFields {
  name?: string | null
  contactEmail?: string | null
  legalJurisdiction?: string | null
  supervisoryAuthority?: {
    name?: string | null
    url?: string | null
    email?: string | null
  } | null
}

/**
 * Build the legal config from a conference and its (optional) organization.
 * PURE — no I/O — so the resolution rules are unit-testable in isolation.
 */
export function buildLegalConfig(
  conference: Conference | null | undefined,
  org: OrganizationLegalFields | null | undefined,
  {
    organizationReadFailed = false,
  }: {
    /**
     * True when the organization read REJECTED. Distinguishes "this tenant has
     * no organization document" from "we could not find out", which used to be
     * the same `null` — the #848 root enabler.
     */
    organizationReadFailed?: boolean
  } = {},
): LegalConfig {
  // Organization name first, then the conference's own `organizer` field — both
  // are the TENANT's data. Nothing further: an unresolved controller stays
  // unresolved rather than becoming the platform's name.
  const controllerName =
    org?.name?.trim() || conference?.organizer?.trim() || ''
  const controllerResolved = controllerName !== ''

  const contactEmail =
    org?.contactEmail?.trim() || resolveConferenceContact(conference)

  // Legal jurisdiction: an explicit org override wins, then the conference
  // country. NO further fallback — an unresolved jurisdiction stays unresolved.
  const rawJurisdiction =
    org?.legalJurisdiction?.trim() || conference?.country?.trim() || ''

  const jurisdictionConfigured = rawJurisdiction !== ''
  const isNorway = rawJurisdiction.toLowerCase() === 'norway'
  // Canonicalize the casing when it IS Norway so a stored "norway" cannot
  // render "Bergen, norway" or a lowercase governing-law clause; other
  // jurisdictions keep the org's own casing (we can't title-case arbitrary
  // country names correctly).
  const jurisdiction = isNorway ? NORWAY : rawJurisdiction

  // Controller location line ("based in …"): it describes the CONTROLLER's
  // seat, so it follows the resolved jurisdiction. The venue city is included
  // only when the conference country agrees with that jurisdiction — an org
  // legal override (e.g. Germany) must not render "Bergen, Germany", nor keep
  // "Bergen, Norway" next to a German governing-law clause. With no
  // jurisdiction at all the line degrades to the city alone, or to nothing.
  const city = conference?.city?.trim()
  const conferenceCountry = conference?.country?.trim()
  const cityMatchesJurisdiction =
    Boolean(city) &&
    (!conferenceCountry ||
      !jurisdictionConfigured ||
      conferenceCountry.toLowerCase() === jurisdiction.toLowerCase())
  const location = cityMatchesJurisdiction
    ? [city, jurisdiction].filter(Boolean).join(', ')
    : jurisdiction

  const orgAuthorityName = org?.supervisoryAuthority?.name?.trim()
  const supervisoryAuthority: SupervisoryAuthority = orgAuthorityName
    ? {
        name: orgAuthorityName,
        url: safeHttpUrl(org?.supervisoryAuthority?.url),
        email: org?.supervisoryAuthority?.email?.trim() || undefined,
      }
    : isNorway
      ? NORWAY_SUPERVISORY_AUTHORITY
      : GENERIC_SUPERVISORY_AUTHORITY

  return {
    controllerName,
    controllerResolved,
    identityReadFailed: organizationReadFailed,
    contactEmail,
    location,
    jurisdiction,
    jurisdictionConfigured,
    isNorway,
    supervisoryAuthority,
  }
}
