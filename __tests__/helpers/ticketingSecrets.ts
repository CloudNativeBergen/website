import { vi } from 'vitest'

/**
 * Give `orgId` its OWN ticketing account in the per-org secret store
 * (`TENANT_SECRETS_JSON`), read through the REAL store so a test's notion of
 * "has ticketing credentials" cannot drift from `resolveTicketingCredentials`.
 *
 * Used by every gate that asks the credential question (`ticketing`,
 * `workshops` since #1295) and by the pages and routers in front of them.
 * Undone by `vi.unstubAllEnvs()`.
 */
export function stubOwnTicketingSecret(orgId: string): void {
  vi.stubEnv(
    'TENANT_SECRETS_JSON',
    JSON.stringify({ [orgId]: { ticketing: { apiKey: 'tenant-key' } } }),
  )
}
