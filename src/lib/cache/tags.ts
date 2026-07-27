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
