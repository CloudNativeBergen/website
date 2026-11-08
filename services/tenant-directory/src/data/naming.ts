// Platform-host naming and hostname normalization. Pure (no bindings), so
// scripts/backfill.ts shares it without loading the D1 stack.

/** The platform-host naming convention, owned here. */
export const PLATFORM_DOMAIN = 'konf.run'
export const editionHost = (org: string, conf: string) =>
  `${org}-${conf}.${PLATFORM_DOMAIN}`
export const aliasHost = (org: string) => `${org}.${PLATFORM_DOMAIN}`

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Org slugs become `<slug>.konf.run`; one shared list (#2129).
export { RESERVED_SLUGS } from '@runkonf/tenancy/reserved'

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
