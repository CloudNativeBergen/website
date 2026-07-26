/**
 * The neutral, brand-free PLATFORM name (CaaS de-branding, go-live gate G2).
 *
 * This is the last-resort fallback used ONLY when no tenant conference resolves
 * for the current request (e.g. the apex/platform host, localhost, a preview
 * deploy with no matching `domains[]`). Tenant-facing surfaces MUST prefer the
 * resolved `conference.title` / `conference.organizer`; this constant is the
 * platform default they degrade to, never a substitute for a tenant's own name.
 *
 * Kept as ONE source of truth so the manifest, root metadata, per-page
 * metadata and OpenGraph alt text all agree on the platform label.
 */
export const PLATFORM_NAME = 'Cloud Native Days'
