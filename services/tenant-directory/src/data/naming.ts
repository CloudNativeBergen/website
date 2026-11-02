// Platform-host naming and hostname normalization. Pure (no bindings), so
// scripts/backfill.ts shares it without loading the D1 stack.

/** The platform-host naming convention, owned here. */
export const PLATFORM_DOMAIN = 'konf.run'
export const editionHost = (org: string, conf: string) =>
  `${org}-${conf}.${PLATFORM_DOMAIN}`
export const aliasHost = (org: string) => `${org}.${PLATFORM_DOMAIN}`

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Org slugs become `<slug>.konf.run`; these names belong to the platform.
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'cdn',
  'dashboard',
  'docs',
  'gateway',
  'help',
  'kontroll',
  'login',
  'mail',
  'my',
  'smtp',
  'static',
  'status',
  'support',
  'www',
])

/** Accepts an Origin (`https://host:port`) or a bare hostname. */
export function normalizeHost(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  try {
    const host = new URL(s.includes('://') ? s : `https://${s}`).hostname
    return host.replace(/\.$/, '') || null
  } catch {
    return null
  }
}
