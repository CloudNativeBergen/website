import { isLocalhostDomain } from '@/lib/environment/localhost'

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

/**
 * The PLATFORM-level base URL (origin, no trailing slash) for genuinely
 * non-tenant outbound/stored links — surfaces that do NOT belong to a single
 * conference and therefore cannot use {@link import('@/lib/conference/baseUrl').conferenceBaseUrl}.
 *
 * Env contract (in precedence order):
 *   1. `NEXT_PUBLIC_BASE_URL` — the canonical, monitored platform origin
 *      (see `src/lib/system-status/checks.ts` → `build.baseUrl`).
 *   2. `NEXT_PUBLIC_URL` — legacy alias still set in `.env.production`.
 *   3. `VERCEL_URL` — the deploy's own hostname (brand-neutral, always set on
 *      Vercel), used so a preview/misconfigured deploy still resolves.
 *
 * Failure behaviour is deliberately LOUD and never leaks `localhost` in
 * production: outside production a missing config degrades to
 * `http://localhost:3000` for local link previews; IN production a total
 * absence of all three env vars is an unrecoverable misconfiguration that is
 * logged via `console.error` and then thrown, rather than silently emitting a
 * dev URL into a real email/notification.
 */
export function platformBaseUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_URL ||
    ''
  ).trim()
  if (configured) {
    // Enforce the origin contract: strip any configured path, and give a
    // scheme-less value the right scheme (`http` for a localhost dev origin).
    const withScheme = /^https?:\/\//i.test(configured)
      ? configured
      : `${isLocalhostDomain(configured) ? 'http' : 'https'}://${configured}`
    try {
      return new URL(withScheme).origin
    } catch {
      console.error(
        `[baseUrl] Configured platform base URL is not a valid URL: "${configured}"`,
      )
    }
  }

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`

  const isProduction =
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  if (!isProduction) return 'http://localhost:3000'

  console.error(
    '[baseUrl] No platform base URL is configured in production. Set ' +
      'NEXT_PUBLIC_BASE_URL to the platform origin — outbound platform-level ' +
      'links cannot be built without it.',
  )
  throw new Error(
    'Platform base URL is not configured (set NEXT_PUBLIC_BASE_URL)',
  )
}
