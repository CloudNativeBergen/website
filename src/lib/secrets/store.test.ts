import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  EnvSecretsStore,
  JsonEnvSecretsStore,
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
  it('returns env ticketing creds regardless of orgId', async () => {
    vi.stubEnv('CHECKIN_API_KEY', 'k')
    vi.stubEnv('CHECKIN_API_SECRET', 's')
    vi.stubEnv('CHECKIN_WEBHOOK_SECRET', 'w')
    const store = new EnvSecretsStore()

    const a = await store.get('org-a', 'ticketing')
    const b = await store.get(null, 'ticketing')
    expect(a).toEqual({ apiKey: 'k', apiSecret: 's', webhookSecret: 'w' })
    // Same platform creds no matter the org (today's shared-account behavior).
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
