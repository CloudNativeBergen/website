import { vi } from 'vitest'

/**
 * Give `orgId` its OWN ticketing account in the per-org secret store
 * (`TENANT_SECRETS_JSON`), read through the REAL store so a test's notion of
 * "has ticketing credentials" cannot drift from `resolveTicketingCredentials`.
 * The bag is complete for EITHER vendor (Checkin needs key + secret, Tito a
 * key), so it reads tickets whatever provider the conference selected.
 *
 * Used by every gate that asks the credential question (`ticketing`,
 * `workshops` since #1295) and by the pages and routers in front of them.
 * Undone by `vi.unstubAllEnvs()`.
 */
export function stubOwnTicketingSecret(orgId: string): void {
  vi.stubEnv(
    'TENANT_SECRETS_JSON',
    JSON.stringify({
      [orgId]: {
        ticketing: { apiKey: 'tenant-key', apiSecret: 'tenant-secret' },
      },
    }),
  )
}

/**
 * The PLATFORM env ticketing account (`CHECKIN_*`), set as it is in
 * production. Only the org named by `PLATFORM_ORG_ID` is ever handed it
 * (`resolveTicketingCredentials`), so stubbing it never gives a tenant
 * credentials — a tenant test that still reads "no credentials" with this in
 * place is proving exactly that.
 */
export function stubPlatformTicketingAccount(): void {
  vi.stubEnv('CHECKIN_API_KEY', 'platform-key')
  vi.stubEnv('CHECKIN_API_SECRET', 'platform-secret')
}
