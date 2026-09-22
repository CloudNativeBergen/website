/**
 * Cache-tag builders — the single source of truth for tenant-scoped
 * `cacheTag`/`revalidateTag` names.
 *
 * Content is served per-conference (multi-tenant, one deploy serves every
 * conference domain). A tenant-scoped tag lets a mutation on one conference
 * invalidate ONLY that conference's cached pages/reads, instead of the broad
 * `content:*` tags that bust every tenant at once.
 *
 * - `conferenceTag(id)` — the per-conference-document tag. Prefer this whenever
 *   the conference `_id` is available (mutations resolve it; page/data
 *   functions resolve the conference from the domain and can tag after the
 *   fetch). This is the tag mutations should revalidate.
 * - `domainTag(domain)` — a per-domain fallback for the rare spot where a
 *   conference id is not available but the host is.
 * - `shortLinkTag(documentId)` — the per-DOCUMENT tag on the `/go/<code>`
 *   lookup (short-links spec §2.5). Keyed on the document the code belongs to
 *   rather than the conference, so repairing one Task's destination does not
 *   discard every other code's cached lookup. Every write that changes a
 *   target — a variant save that rewrites `link`, an outreach Task's
 *   `targetPage`, an outreach Task delete — must EXPIRE it.
 * - `shortLinkIndexTag(conferenceId)` — the per-CONFERENCE tag on the set of
 *   short codes that conference holds. It is what makes §2.4's "a scanner
 *   costs nothing" true for WELL-FORMED codes: an unknown one is ruled out
 *   against this cached set instead of costing a Sanity read of its own.
 *   Every write that CREATES, backfills or deletes a code must expire it.
 * - `organizationTag(orgId)` — the per-ORGANIZATION-document tag, for cached
 *   reads keyed on the tenant itself rather than one of its conference
 *   editions (plan/entitlement resolution). Mutations that edit an
 *   organization document must revalidate this tag.
 */

export function conferenceTag(conferenceId: string): string {
  return `sanity:conference-${conferenceId}`
}

export function domainTag(domain: string): string {
  return `domain:${domain}`
}

export function organizationTag(orgId: string): string {
  return `sanity:organization-${orgId}`
}

/**
 * The `/go/<code>` lookup entry for one document (`socialPostVariant` or
 * `marketingTask`). Revalidate it with `{ expire: 0 }`, not a profile: a
 * repaired or deleted destination must not keep being served stale.
 */
export function shortLinkTag(documentId: string): string {
  return `sanity:short-link-${documentId}`
}

/**
 * The set of `/go/` codes one conference holds. Separate from
 * {@link shortLinkTag}: that one is per DOCUMENT and invalidates a single
 * resolved target, this one is per CONFERENCE and invalidates the membership
 * set the route uses to reject unknown codes without reading Sanity.
 */
export function shortLinkIndexTag(conferenceId: string): string {
  return `sanity:short-link-index-${conferenceId}`
}
