import { resolveConferenceContact } from '@/lib/email/from'
import { PLATFORM_NAME } from '@/lib/branding/platform'
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
 * DEFAULTS preserve the existing tenant exactly: absent org legal fields resolve
 * to Norway + Datatilsynet, and the Norway-specific prose (tax law, "Norwegian
 * data protection laws") renders only when the jurisdiction is Norway.
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

const DEFAULT_JURISDICTION = 'Norway'

export interface LegalConfig {
  /** The data controller / legal entity name shown throughout the pages. */
  controllerName: string
  /** The controller's contact address for privacy / terms enquiries. */
  contactEmail: string
  /** Human location line for the controller, e.g. "Bergen, Norway". */
  location: string
  /** Country whose law governs (terms) and whose tax law is referenced. */
  jurisdiction: string
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
): LegalConfig {
  const controllerName =
    org?.name?.trim() || conference?.organizer?.trim() || PLATFORM_NAME

  const contactEmail =
    org?.contactEmail?.trim() || resolveConferenceContact(conference)

  // Legal jurisdiction: an explicit org override wins; otherwise fall back to
  // the conference country, then Norway (the existing tenant's value).
  const jurisdiction =
    org?.legalJurisdiction?.trim() ||
    conference?.country?.trim() ||
    DEFAULT_JURISDICTION

  const isNorway = jurisdiction.toLowerCase() === 'norway'

  // Controller location line: city + country when both are known, else whatever
  // single part we have, else the jurisdiction.
  const city = conference?.city?.trim()
  const country = conference?.country?.trim() || jurisdiction
  const location = city ? `${city}, ${country}` : country

  const orgAuthorityName = org?.supervisoryAuthority?.name?.trim()
  const supervisoryAuthority: SupervisoryAuthority = orgAuthorityName
    ? {
        name: orgAuthorityName,
        url: org?.supervisoryAuthority?.url?.trim() || undefined,
        email: org?.supervisoryAuthority?.email?.trim() || undefined,
      }
    : isNorway
      ? NORWAY_SUPERVISORY_AUTHORITY
      : GENERIC_SUPERVISORY_AUTHORITY

  return {
    controllerName,
    contactEmail,
    location,
    jurisdiction,
    isNorway,
    supervisoryAuthority,
  }
}
