import { describe, it, expect, vi, afterEach } from 'vitest'
import { getResendClient, resolveEmailSender, resend } from './config'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('getResendClient', () => {
  it('returns the SAME cached platform client for the env credentials', () => {
    const a = getResendClient()
    const b = getResendClient()
    expect(a).toBe(b)
    // The exported `resend` is that same cached platform instance.
    expect(a).toBe(resend)
    // Explicitly passing the platform key resolves to the same cached client.
    expect(getResendClient({ apiKey: 'test_key' })).toBe(resend)
  })

  it('mints a DISTINCT client for a non-platform credential', () => {
    const orgClient = getResendClient({ apiKey: 're_org_key' })
    expect(orgClient).not.toBe(resend)
  })
})

describe('resolveEmailSender', () => {
  it('returns the cached platform client under the env fallback', async () => {
    const sender = await resolveEmailSender('org-a')
    expect(sender.client).toBe(resend)
    expect(sender.from).toBeUndefined()
  })

  it('returns a per-org client + From when a per-org email secret exists', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        'org-a': {
          email: { apiKey: 're_org_key', fallbackFrom: 'hello@org-a.no' },
        },
      }),
    )
    const sender = await resolveEmailSender('org-a')
    expect(sender.client).not.toBe(resend)
    expect(sender.from).toBe('hello@org-a.no')

    // A different org with no per-org secret still gets the platform default.
    const other = await resolveEmailSender('org-b')
    expect(other.client).toBe(resend)
  })
})

/**
 * THE #843 / #844 INTERACTION — the one place the two fixes could have fought.
 *
 * #844 makes `EnvSecretsStore` refuse a non-platform org, so
 * `resolveTenantSecrets(tenantOrg, 'email')` now returns `null` where it used to
 * return the platform `RESEND_API_KEY`. Email is the ONE consumer that wants the
 * platform account as a deliberate product tier — shared-services T0, where a
 * tenant with no Resend account of its own sends through the platform's, with
 * `sender-policy.ts` forcing a platform-verified `From:`.
 *
 * They do not actually conflict, and this pins WHY: `resolveEmailSender` has its
 * OWN explicit fallback to the platform client, so a `null` from the chain lands
 * on the same cached instance the env credentials used to produce. Before #844
 * the tenant got `getResendClient({apiKey: RESEND_API_KEY})`, which short-circuits
 * to the cached platform client; after #844 it gets `{ client: resend }` — the
 * same object, by identity. The tier is expressed in `config.ts` rather than
 * smuggled through a credential store that hands out the platform's key to
 * everybody, which is the distinction #844 is about.
 *
 * These assertions are IDENTITY comparisons (`toBe`), not shape comparisons: a
 * second Resend instance built from the same key would enforce the sender policy
 * too, so `toEqual` could not tell the tier from a regression.
 */
describe('resolveEmailSender under the #844 platform-org gate', () => {
  const PLATFORM = 'org-platform'
  const TENANT = 'org-tenant'

  it('keeps the shared T0 tier: a NON-platform tenant still sends on the platform client', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)

    // The control: the platform org's own resolution is unchanged…
    expect((await resolveEmailSender(PLATFORM)).client).toBe(resend)
    // …and so is a tenant's, even though the secrets chain now refuses it.
    expect((await resolveEmailSender(TENANT)).client).toBe(resend)
    // Including the unresolvable-org case, which the chain also refuses.
    expect((await resolveEmailSender(null)).client).toBe(resend)
    expect((await resolveEmailSender(undefined)).client).toBe(resend)
  })

  it('still routes a tenant with its OWN key to its OWN account (#843)', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [TENANT]: {
          email: { apiKey: 're_tenant_key', fallbackFrom: 'hei@tenant.no' },
        },
      }),
    )

    const tenant = await resolveEmailSender(TENANT)
    // The whole point of #843: this is NOT the platform account.
    expect(tenant.client).not.toBe(resend)
    expect(tenant.from).toBe('hei@tenant.no')

    // A per-org secret is the tenant's OWN credential, so the #844 gate does not
    // stand in front of it — it never touches the env store at all.
    const platform = await resolveEmailSender(PLATFORM)
    expect(platform.client).toBe(resend)
  })
})
