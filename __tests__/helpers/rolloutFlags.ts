/**
 * Stand-in for `rolloutFlags` (src/lib/conference/konf-api.ts) in tests that
 * gate a code path on a tenant's flags. The real flags come from D1 through
 * the gateway; tests name the flagged conference or organization ids here.
 *
 *   vi.mock('@/lib/conference/konf-api', async (orig) => ({
 *     ...(await orig<object>()),
 *     rolloutFlags: (await import('<rel>/helpers/rolloutFlags')).fakeRolloutFlags,
 *   }))
 *   import { flagTenants } from '<rel>/helpers/rolloutFlags'
 *   flagTenants('apiRead', 'conf-1')
 *
 * Importing it registers a beforeEach that clears every flag.
 */
import { beforeEach } from 'vitest'
import type { RolloutFlags } from '@/lib/conference/konf-api'

const flagged: Record<keyof RolloutFlags, string[]> = {
  apiRead: [],
  identityLogin: [],
  d1Write: [],
}

/** Turn `flag` on for exactly these ids (comma-separated, conference or org). */
export function flagTenants(flag: keyof RolloutFlags, ids: string) {
  flagged[flag] = ids
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

beforeEach(() => {
  for (const k of Object.keys(flagged) as (keyof RolloutFlags)[])
    flagged[k] = []
})

export async function fakeRolloutFlags(
  _host: string | null,
  conference: { _id: string; organization?: { _ref?: string } | null },
  _opts?: { verify?: boolean },
): Promise<RolloutFlags> {
  // The kill switch, as the real rolloutFlags honours it.
  if (process.env.KONF_API_DISABLED === '1')
    return { apiRead: false, identityLogin: false, d1Write: false }
  const on = (ids: string[]) =>
    ids.includes(conference._id) ||
    (!!conference.organization?._ref &&
      ids.includes(conference.organization._ref))
  return {
    apiRead: on(flagged.apiRead),
    identityLogin: on(flagged.identityLogin),
    d1Write: on(flagged.d1Write),
  }
}
