/**
 * @vitest-environment node
 *
 * CROSS-TENANT ISOLATION for the Slack bot token.
 *
 * `resolveConferenceSlackToken` is the ONLY source of a token —
 * `postSlackMessage` has no env fallback — so what this file proves about the
 * resolver holds for every Slack sender in the app (`notify.ts`,
 * `weeklyUpdate.ts`, the weekly-update cron, the admin status probe).
 *
 * THE INVARIANTS:
 *  1. A NON-PLATFORM org with no per-org secret gets NO token, even with
 *     `SLACK_BOT_TOKEN` set — the platform's bot must not post that tenant's
 *     content into the platform workspace under a tenant-typed channel name.
 *  2. The PLATFORM org (CNDN in production) still gets the env token. The hard
 *     constraint on this change is that it loses nothing.
 *  3. An UNRESOLVABLE org (no `organization` ref, unknown document, failed read)
 *     gets NO token — fail closed.
 *  4. A per-org token is the tenant's OWN credential and flows regardless of the
 *     gate; provisioning it IS the grant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getOrganizationById = vi.fn()

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => getOrganizationById(...args),
  getOrganizationRefForCurrentConference: vi.fn(),
}))

import { resolveConferenceSlackToken } from './token'

const PLATFORM_ORG_ID = 'org-platform'
const TENANT_ORG_ID = 'org-tenant'
const PLATFORM_TOKEN = 'xoxb-platform-bot'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('SLACK_BOT_TOKEN', PLATFORM_TOKEN)
  getOrganizationById.mockResolvedValue({
    _id: TENANT_ORG_ID,
    name: 'Tenant',
    slug: 'tenant',
    plan: 'enterprise',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveConferenceSlackToken — a second tenant gets nothing', () => {
  it('gives a NON-platform org NO token even though SLACK_BOT_TOKEN is set', async () => {
    await expect(
      resolveConferenceSlackToken({
        organization: { _ref: TENANT_ORG_ID },
      }),
    ).resolves.toBeUndefined()
  })

  it('gives a non-platform org nothing on ANY plan (this is not a plan feature)', async () => {
    for (const plan of ['community', 'pro', 'enterprise'] as const) {
      getOrganizationById.mockResolvedValue({
        _id: TENANT_ORG_ID,
        name: 'Tenant',
        slug: 'tenant',
        plan,
      })
      await expect(
        resolveConferenceSlackToken({
          organization: { _ref: TENANT_ORG_ID },
        }),
      ).resolves.toBeUndefined()
    }
  })

  it('does not leak the platform token to a tenant whose SLUG looks like the platform', async () => {
    getOrganizationById.mockResolvedValue({
      _id: TENANT_ORG_ID,
      name: 'Impostor',
      slug: 'platform-org',
      plan: 'enterprise',
    })
    await expect(
      resolveConferenceSlackToken({
        organization: { _ref: TENANT_ORG_ID },
      }),
    ).resolves.toBeUndefined()
  })
})

describe('resolveConferenceSlackToken — the platform org keeps everything', () => {
  it('gives the platform org the env token', async () => {
    getOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Cloud Native Days',
      slug: 'cloud-native-days',
    })
    await expect(
      resolveConferenceSlackToken({
        organization: { _ref: PLATFORM_ORG_ID },
      }),
    ).resolves.toBe(PLATFORM_TOKEN)
  })

  it('still resolves nothing when the platform env token itself is unset', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    getOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Cloud Native Days',
      slug: 'cloud-native-days',
    })
    await expect(
      resolveConferenceSlackToken({
        organization: { _ref: PLATFORM_ORG_ID },
      }),
    ).resolves.toBeUndefined()
  })

  it('honours an explicit override granting a pilot org the platform token', async () => {
    getOrganizationById.mockResolvedValue({
      _id: TENANT_ORG_ID,
      name: 'Pilot',
      slug: 'pilot',
      featureOverrides: [{ feature: 'slack-mirror', enabled: true }],
    })
    await expect(
      resolveConferenceSlackToken({
        organization: { _ref: TENANT_ORG_ID },
      }),
    ).resolves.toBe(PLATFORM_TOKEN)
  })
})

describe('resolveConferenceSlackToken — fails CLOSED', () => {
  it('resolves nothing for a conference with no organization ref', async () => {
    await expect(resolveConferenceSlackToken({})).resolves.toBeUndefined()
    await expect(
      resolveConferenceSlackToken({ organization: null }),
    ).resolves.toBeUndefined()
    await expect(
      resolveConferenceSlackToken({ organization: {} }),
    ).resolves.toBeUndefined()
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('resolves nothing for an unknown organization document', async () => {
    getOrganizationById.mockResolvedValue(null)
    await expect(
      resolveConferenceSlackToken({ organization: { _ref: 'org-ghost' } }),
    ).resolves.toBeUndefined()
  })

  it('resolves nothing — and does not throw — when the org read REJECTS', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrganizationById.mockRejectedValue(new Error('sanity unavailable'))
    await expect(
      resolveConferenceSlackToken({ organization: { _ref: TENANT_ORG_ID } }),
    ).resolves.toBeUndefined()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('resolves nothing for ANY org when PLATFORM_ORG_ID is unset (local dev)', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    for (const orgId of [PLATFORM_ORG_ID, TENANT_ORG_ID]) {
      getOrganizationById.mockResolvedValue({
        _id: orgId,
        name: 'Any',
        slug: 'any',
      })
      await expect(
        resolveConferenceSlackToken({ organization: { _ref: orgId } }),
      ).resolves.toBeUndefined()
    }
  })
})

describe("resolveConferenceSlackToken — a tenant's OWN token is not gated", () => {
  it("returns the per-org token for a non-platform org, and never the platform's", async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [TENANT_ORG_ID]: { slack: { botToken: 'xoxb-tenant-own' } },
      }),
    )
    await expect(
      resolveConferenceSlackToken({ organization: { _ref: TENANT_ORG_ID } }),
    ).resolves.toBe('xoxb-tenant-own')
    // Its own credential decides it — no entitlement read is needed at all.
    expect(getOrganizationById).not.toHaveBeenCalled()
  })

  it('prefers a per-org token over the env token for the platform org too', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [PLATFORM_ORG_ID]: { slack: { botToken: 'xoxb-platform-own' } },
      }),
    )
    await expect(
      resolveConferenceSlackToken({ organization: { _ref: PLATFORM_ORG_ID } }),
    ).resolves.toBe('xoxb-platform-own')
  })
})
