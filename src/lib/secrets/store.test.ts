import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  EnvSecretsStore,
  JsonEnvSecretsStore,
  platformEnvCredentials,
  resolveTenantSecrets,
  type TenantSecretsStore,
} from './store'
import type { FamilyCredentials, SecretFamily } from './types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** A fixed in-memory store, for exercising the composition in isolation. */
function fakeStore(
  entries: Partial<Record<string, Partial<Record<SecretFamily, unknown>>>>,
): TenantSecretsStore {
  return {
    async get<F extends SecretFamily>(
      orgId: string | null | undefined,
      family: F,
    ) {
      if (!orgId) return null
      return (entries[orgId]?.[family] ?? null) as FamilyCredentials<F> | null
    },
  }
}

describe('EnvSecretsStore', () => {
  it('returns env ticketing creds to every org when no platform org is configured', async () => {
    // PLATFORM_ORG_ID is unset here (as in .env.test and every self-hosted
    // deploy), which is the single-tenant case: the env is the only org's own.
    vi.stubEnv('PLATFORM_ORG_ID', '')
    vi.stubEnv('CHECKIN_API_KEY', 'k')
    vi.stubEnv('CHECKIN_API_SECRET', 's')
    vi.stubEnv('CHECKIN_WEBHOOK_SECRET', 'w')
    const store = new EnvSecretsStore()

    const a = await store.get('org-a', 'ticketing')
    const b = await store.get(null, 'ticketing')
    expect(a).toEqual({ apiKey: 'k', apiSecret: 's', webhookSecret: 'w' })
    expect(b).toEqual(a)
  })

  it('returns null for a family with no configured env vars', async () => {
    // Clear anything the ambient .env.test may set so each family is truly empty.
    for (const key of [
      'CHECKIN_API_KEY',
      'CHECKIN_API_SECRET',
      'CHECKIN_WEBHOOK_SECRET',
      'RESEND_API_KEY',
      'SLACK_BOT_TOKEN',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
      'BADGE_ISSUER_RSA_PRIVATE_KEY',
      'BADGE_ISSUER_RSA_PUBLIC_KEY',
      'BADGE_ISSUER_ED25519_SEED',
    ]) {
      vi.stubEnv(key, '')
    }
    const store = new EnvSecretsStore()
    expect(await store.get('org-a', 'ticketing')).toBeNull()
    expect(await store.get('org-a', 'email')).toBeNull()
    expect(await store.get('org-a', 'slack')).toBeNull()
    expect(await store.get('org-a', 'push')).toBeNull()
    expect(await store.get('org-a', 'badge')).toBeNull()
  })

  it('assembles email / slack / push / badge families from env', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key')
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-1')
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.no')
    vi.stubEnv('BADGE_ISSUER_RSA_PRIVATE_KEY', 'rsa-priv')
    vi.stubEnv('BADGE_ISSUER_RSA_PUBLIC_KEY', 'rsa-pub')
    vi.stubEnv('BADGE_ISSUER_ED25519_SEED', 'seed')
    vi.stubEnv('BADGE_ISSUER_RSA_ONLY', 'true')
    const store = new EnvSecretsStore()

    expect(await store.get('o', 'email')).toEqual({ apiKey: 're_key' })
    expect(await store.get('o', 'slack')).toEqual({ botToken: 'xoxb-1' })
    expect(await store.get('o', 'push')).toEqual({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:a@b.no',
    })
    expect(await store.get('o', 'badge')).toEqual({
      rsaPrivateKey: 'rsa-priv',
      rsaPublicKey: 'rsa-pub',
      ed25519Seed: 'seed',
      rsaOnly: true,
    })
  })
})

/**
 * #844 — the default chain must fail CLOSED.
 *
 * `EnvSecretsStore` used to be org-blind: it took an `orgId`, ignored it, and
 * handed the platform's accounts to anybody, so a naive
 * `resolveTenantSecrets(orgId, family)` silently returned another tenant's
 * credentials. These tests pin the gate.
 *
 * HOW EACH ONE AVOIDS PASSING FOR THE WRONG REASON. A bare `toBeNull()` would
 * also pass if the env var were simply unset (or a stub silently failed), which
 * is exactly the false green that makes a security test worthless. So EVERY
 * refusal below is asserted TOGETHER WITH the platform org's success under the
 * IDENTICAL env, in the same test body. The only difference between the two
 * assertions is the org id — so if the env were not configured, the paired
 * platform assertion fails and the test cannot go green. `expect.not.toBeNull()`
 * on the platform side is deliberate load-bearing scaffolding, not decoration.
 */
describe('EnvSecretsStore — cross-tenant isolation (#844)', () => {
  const PLATFORM = 'org-platform'
  const TENANT = 'org-tenant'

  /** Every family, with an env value configured for each. */
  function configureEveryFamily() {
    vi.stubEnv('CHECKIN_API_KEY', 'checkin-key')
    vi.stubEnv('CHECKIN_API_SECRET', 'checkin-secret')
    vi.stubEnv('CHECKIN_WEBHOOK_SECRET', 'checkin-webhook')
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-platform')
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:ops@platform.test')
    vi.stubEnv('BADGE_ISSUER_RSA_PRIVATE_KEY', 'rsa-priv')
    vi.stubEnv('BADGE_ISSUER_RSA_PUBLIC_KEY', 'rsa-pub')
    vi.stubEnv('BADGE_ISSUER_ED25519_SEED', 'seed')
  }

  const FAMILIES: SecretFamily[] = [
    'ticketing',
    'email',
    'slack',
    'push',
    'badge',
  ]

  it('refuses a NON-platform org every family the platform org receives', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    configureEveryFamily()
    const store = new EnvSecretsStore()

    for (const family of FAMILIES) {
      // The control: with this exact env, the platform org DOES get creds. If
      // this side ever went null the env would be unconfigured and the refusal
      // below would prove nothing — so the pair is what makes the test real.
      expect(await store.get(PLATFORM, family)).not.toBeNull()
      // The guard under test.
      expect(await store.get(TENANT, family)).toBeNull()
    }
  })

  it('refuses an UNRESOLVABLE org (null/undefined/empty) once the contract is set', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    configureEveryFamily()
    const store = new EnvSecretsStore()

    expect(await store.get(PLATFORM, 'email')).not.toBeNull()
    for (const orgId of [null, undefined, '']) {
      expect(await store.get(orgId, 'email')).toBeNull()
      expect(await store.get(orgId, 'slack')).toBeNull()
    }
  })

  it('never matches on anything but the configured id — a look-alike gets nothing', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    configureEveryFamily()
    const store = new EnvSecretsStore()

    expect(await store.get(PLATFORM, 'slack')).not.toBeNull()
    for (const impostor of [
      `${PLATFORM}-2`,
      ` ${PLATFORM}`,
      PLATFORM.toUpperCase(),
      'org-platform-clone',
    ]) {
      expect(await store.get(impostor, 'slack')).toBeNull()
    }
  })

  it('keeps every org working when PLATFORM_ORG_ID is UNSET (single-tenant / self-hosted)', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', '')
    configureEveryFamily()
    const store = new EnvSecretsStore()

    for (const family of FAMILIES) {
      expect(await store.get(TENANT, family)).not.toBeNull()
      expect(await store.get(null, family)).not.toBeNull()
    }
  })

  it('DEFAULT chain: a tenant gets its OWN secret or nothing — never the platform env', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-platform')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ 'org-own': { slack: { botToken: 'xoxb-own' } } }),
    )

    // Control: the platform org still reaches its env token through the chain.
    expect(await resolveTenantSecrets(PLATFORM, 'slack')).toEqual({
      botToken: 'xoxb-platform',
    })
    // A tenant WITH its own secret gets that — provisioning is the grant.
    expect(await resolveTenantSecrets('org-own', 'slack')).toEqual({
      botToken: 'xoxb-own',
    })
    // A tenant WITHOUT one gets null, not 'xoxb-platform'. This is the exact
    // call shape #844 says a future consumer would write naively.
    expect(await resolveTenantSecrets(TENANT, 'slack')).toBeNull()
  })

  it('leaves the raw platform accessor org-blind on purpose (Slack reads it behind its own gate)', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-platform')
    // No orgId to pass: the caller, not this function, decides authorization.
    expect(platformEnvCredentials('slack')).toEqual({
      botToken: 'xoxb-platform',
    })
    // …and it is still honest about an unconfigured family.
    vi.stubEnv('SLACK_BOT_TOKEN', '')
    expect(platformEnvCredentials('slack')).toBeNull()
  })
})

describe('JsonEnvSecretsStore', () => {
  it('returns null when TENANT_SECRETS_JSON is unset', async () => {
    const store = new JsonEnvSecretsStore()
    expect(await store.get('org-a', 'ticketing')).toBeNull()
  })

  it('returns null for an unknown org / family and requires an orgId', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ 'org-a': { slack: { botToken: 't' } } }),
    )
    const store = new JsonEnvSecretsStore()
    expect(await store.get('org-a', 'ticketing')).toBeNull()
    expect(await store.get('org-b', 'slack')).toBeNull()
    expect(await store.get(null, 'slack')).toBeNull()
    expect(await store.get('org-a', 'slack')).toEqual({ botToken: 't' })
  })

  it('does not throw on malformed JSON — warns once and returns null', async () => {
    vi.stubEnv('TENANT_SECRETS_JSON', '{not valid json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = new JsonEnvSecretsStore()
    expect(await store.get('org-a', 'slack')).toBeNull()
    expect(await store.get('org-a', 'email')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('ignores a non-object or empty per-org entry (env fallback applies)', async () => {
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ 'org-1': { ticketing: 'not-an-object', email: {} } }),
    )
    const store = new JsonEnvSecretsStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await store.get('org-1', 'ticketing')).toBeNull()
    expect(await store.get('org-1', 'email')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('resolveTenantSecrets composition', () => {
  const perOrg = fakeStore({
    'org-a': { ticketing: { apiKey: 'org-a-key' } },
  })
  const env = fakeStore({
    'org-a': {},
  })
  // The env fake ignores orgId (mirrors EnvSecretsStore) by always answering.
  const envAlways: TenantSecretsStore = {
    async get<F extends SecretFamily>(_o: unknown, family: F) {
      return (
        family === 'ticketing' ? { apiKey: 'env-key' } : null
      ) as FamilyCredentials<F> | null
    },
  }

  it('prefers a per-org hit over the env fallback', async () => {
    const creds = await resolveTenantSecrets('org-a', 'ticketing', [
      perOrg,
      envAlways,
    ])
    expect(creds).toEqual({ apiKey: 'org-a-key' })
  })

  it('falls back to env when the per-org store misses', async () => {
    const creds = await resolveTenantSecrets('org-b', 'ticketing', [
      perOrg,
      envAlways,
    ])
    expect(creds).toEqual({ apiKey: 'env-key' })
  })

  it('returns null when no store in the chain resolves', async () => {
    const creds = await resolveTenantSecrets('org-b', 'ticketing', [
      perOrg,
      env,
    ])
    expect(creds).toBeNull()
  })

  it('default chain: per-org JSON wins, else env, else null', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'env-token')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ 'org-a': { slack: { botToken: 'org-a-token' } } }),
    )
    // Per-org tenant gets its own token.
    expect(await resolveTenantSecrets('org-a', 'slack')).toEqual({
      botToken: 'org-a-token',
    })
    // Another tenant falls back to the platform env token.
    expect(await resolveTenantSecrets('org-b', 'slack')).toEqual({
      botToken: 'env-token',
    })
  })
})
