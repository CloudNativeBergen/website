import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  EnvPerOrgSecretsStore,
  TENANT_ENV_SLUGS,
  tenantEnvSlug,
  tenantEnvVarName,
  validateTenantEnvSlugs,
} from './env-per-org'
import { DEFAULT_SECRETS_CHAIN, resolveTenantSecrets } from './store'
import type { SecretFamily } from './types'

/**
 * PER-ORG DISCRETE ENV VARS (RunKonf/platform#57).
 *
 * The property under test throughout is FAIL CLOSED: this store either produces
 * a COMPLETE credential bag for a MAPPED org, or `null`. Anything else — an
 * unmapped org, an unresolvable org, a family with no consumer, a half-set of
 * variables — must resolve to `null` so the chain falls through and the consumer
 * takes the same soft-fail path it takes when nothing is configured.
 *
 * HOW THESE TESTS AVOID PASSING FOR THE WRONG REASON. A bare `toBeNull()` also
 * passes when the env stub silently did nothing, which is the false green that
 * makes a fail-closed test worthless. So every refusal below is asserted
 * ALONGSIDE a positive control under the SAME env, differing only in the one
 * variable under test.
 */

const CNDN = 'organization-cloud-native-days'
const SLUG = 'CNDN'

/** Every discrete var this store knows about, cleared. */
function clearTenantVars() {
  for (const name of [
    'TENANT_CNDN_EMAIL_API_KEY',
    'TENANT_CNDN_EMAIL_FROM',
    'TENANT_CNDN_CHECKIN_API_KEY',
    'TENANT_CNDN_CHECKIN_API_SECRET',
    'TENANT_CNDN_CHECKIN_WEBHOOK_SECRET',
  ]) {
    vi.stubEnv(name, '')
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('TENANT_ENV_SLUGS — the map is code, not Sanity', () => {
  it('maps the CNDN organization document id to its env slug', () => {
    // The KEY is the immutable Sanity document `_id`, not the org's slug field.
    expect(TENANT_ENV_SLUGS[CNDN]).toBe(SLUG)
    expect(tenantEnvSlug(CNDN)).toBe(SLUG)
  })

  it('is frozen — nothing can add a tenant at runtime', () => {
    expect(Object.isFrozen(TENANT_ENV_SLUGS)).toBe(true)
  })

  it('resolves no slug for an unmapped or unresolvable org', () => {
    for (const orgId of ['kkdemo.org', 'org-unknown', '', null, undefined]) {
      expect(tenantEnvSlug(orgId)).toBeNull()
    }
  })

  it('renders the documented variable names', () => {
    expect(tenantEnvVarName(SLUG, 'email', 'API_KEY')).toBe(
      'TENANT_CNDN_EMAIL_API_KEY',
    )
    expect(tenantEnvVarName(SLUG, 'email', 'FROM')).toBe(
      'TENANT_CNDN_EMAIL_FROM',
    )
    expect(tenantEnvVarName(SLUG, 'ticketing', 'API_KEY')).toBe(
      'TENANT_CNDN_CHECKIN_API_KEY',
    )
    expect(tenantEnvVarName(SLUG, 'ticketing', 'API_SECRET')).toBe(
      'TENANT_CNDN_CHECKIN_API_SECRET',
    )
    expect(tenantEnvVarName(SLUG, 'ticketing', 'WEBHOOK_SECRET')).toBe(
      'TENANT_CNDN_CHECKIN_WEBHOOK_SECRET',
    )
  })
})

/**
 * A bad entry must fail at MODULE LOAD (build/boot/test run), never at send
 * time. The map is a source literal, so the only way it can be wrong is a
 * developer writing it wrong — which is exactly what these reject.
 */
describe('validateTenantEnvSlugs', () => {
  it('accepts an uppercase-alphanumeric slug and returns a frozen copy', () => {
    const map = validateTenantEnvSlugs({ 'org-a': 'A1', 'org-b': 'BCD' })
    expect(map).toEqual({ 'org-a': 'A1', 'org-b': 'BCD' })
    expect(Object.isFrozen(map)).toBe(true)
  })

  it('rejects a slug that is not uppercase alphanumeric', () => {
    for (const bad of [
      'cndn',
      'CN-DN',
      'CN DN',
      'CN.DN',
      'CNDN!',
      '',
      'CN_DN',
    ]) {
      // `CN_DN` matters specifically: an underscore makes
      // TENANT_<SLUG>_<FAMILY>_<FIELD> ambiguous to read back.
      expect(() => validateTenantEnvSlugs({ 'org-a': bad })).toThrow(
        /not uppercase alphanumeric/,
      )
    }
  })

  it('rejects an empty organization id', () => {
    expect(() => validateTenantEnvSlugs({ '  ': 'X' })).toThrow(
      /empty organization id/,
    )
  })

  it('rejects two organizations sharing one slug — a leak by typo', () => {
    expect(() =>
      validateTenantEnvSlugs({ 'org-a': 'DUP', 'org-b': 'DUP' }),
    ).toThrow(/both org-a and org-b/)
  })
})

describe('EnvPerOrgSecretsStore — email', () => {
  it('resolves the API key alone as a complete credential', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'email')).toEqual({
      apiKey: 're_cndn',
    })
  })

  it('carries the optional From when set', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    vi.stubEnv(
      'TENANT_CNDN_EMAIL_FROM',
      'Cloud Native <hei@cloudnativebergen.dev>',
    )
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'email')).toEqual({
      apiKey: 're_cndn',
      fallbackFrom: 'Cloud Native <hei@cloudnativebergen.dev>',
    })
  })

  it('trims a pasted value (a trailing newline is not a different key)', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', '  re_cndn\n')
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'email')).toEqual({
      apiKey: 're_cndn',
    })
  })

  it('treats a whitespace-only value as unset', async () => {
    clearTenantVars()
    const store = new EnvPerOrgSecretsStore()
    // Control under the same env: a real value resolves.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    expect(await store.get(CNDN, 'email')).not.toBeNull()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', '   ')
    expect(await store.get(CNDN, 'email')).toBeNull()
  })

  /**
   * THE FAILURE THIS WHOLE CHANGE EXISTS TO PREVENT: a From set without a key
   * would, if it resolved, produce `{ apiKey: undefined }` — a bag that reads as
   * configured, is handed to Resend, and fails. It must be `null` so the tenant
   * stays on its current sender until the cutover is COMPLETE.
   */
  it('returns null — not a partial bag — when only the From is set', async () => {
    clearTenantVars()
    const store = new EnvPerOrgSecretsStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('TENANT_CNDN_EMAIL_FROM', 'hei@cloudnativebergen.dev')

    const creds = await store.get(CNDN, 'email')
    expect(creds).toBeNull()
    // Not "a bag whose apiKey happens to be undefined" — no bag at all.
    expect(creds).not.toMatchObject({ apiKey: undefined })
    // …and the half-configuration is LOUD, once.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('TENANT_CNDN_EMAIL_API_KEY')

    // The control: adding the missing key under the same env resolves.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    expect(await store.get(CNDN, 'email')).toEqual({
      apiKey: 're_cndn',
      fallbackFrom: 'hei@cloudnativebergen.dev',
    })
  })

  it('warns once per tenant/family, not once per lookup', async () => {
    clearTenantVars()
    const store = new EnvPerOrgSecretsStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('TENANT_CNDN_EMAIL_FROM', 'hei@cloudnativebergen.dev')
    await store.get(CNDN, 'email')
    await store.get(CNDN, 'email')
    await store.get(CNDN, 'email')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('EnvPerOrgSecretsStore — ticketing (Checkin-shaped)', () => {
  const FULL = {
    TENANT_CNDN_CHECKIN_API_KEY: 'ck-key',
    TENANT_CNDN_CHECKIN_API_SECRET: 'ck-secret',
    TENANT_CNDN_CHECKIN_WEBHOOK_SECRET: 'ck-webhook',
  }

  function stub(vars: Record<string, string>) {
    clearTenantVars()
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
  }

  it('resolves the full three-variable set', async () => {
    stub(FULL)
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'ticketing')).toEqual({
      apiKey: 'ck-key',
      apiSecret: 'ck-secret',
      webhookSecret: 'ck-webhook',
    })
  })

  /**
   * EVERY proper subset returns `null`. `TicketingCredentials` has all-optional
   * fields, so a partial bag is well-typed, is accepted by `CheckinProvider`,
   * and fails deep inside a consumer's error path — or, worse, reads fine and
   * silently cannot verify a webhook. The control below runs the FULL set
   * through the identical code path so the refusals cannot be an env-stub
   * artefact.
   */
  it('returns null for EVERY partial set — never a bag with undefined fields', async () => {
    const store = new EnvPerOrgSecretsStore()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const names = Object.keys(FULL)

    for (const omitted of names) {
      const partial = Object.fromEntries(
        Object.entries(FULL).filter(([k]) => k !== omitted),
      )
      stub(partial)
      const creds = await store.get(CNDN, 'ticketing')
      expect(creds, `omitting ${omitted}`).toBeNull()
    }

    // Two of three missing, and one of three missing, are the same answer.
    for (const only of names) {
      stub({ [only]: FULL[only as keyof typeof FULL] })
      expect(await store.get(CNDN, 'ticketing'), `only ${only}`).toBeNull()
    }

    // THE CONTROL: the full set, same store, same code path, resolves.
    stub(FULL)
    expect(await store.get(CNDN, 'ticketing')).toEqual({
      apiKey: 'ck-key',
      apiSecret: 'ck-secret',
      webhookSecret: 'ck-webhook',
    })
  })

  it('warns on a partial set but stays silent when nothing at all is set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    clearTenantVars()
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'ticketing')).toBeNull()
    expect(warn).not.toHaveBeenCalled()

    stub({ TENANT_CNDN_CHECKIN_API_KEY: 'ck-key' })
    expect(await new EnvPerOrgSecretsStore().get(CNDN, 'ticketing')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('TENANT_CNDN_CHECKIN_API_SECRET')
    expect(warn.mock.calls[0][0]).toContain(
      'TENANT_CNDN_CHECKIN_WEBHOOK_SECRET',
    )
  })
})

describe('EnvPerOrgSecretsStore — fail closed', () => {
  it('refuses an UNMAPPED org even when identically-named vars exist', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    vi.stubEnv('TENANT_KKDEMO_EMAIL_API_KEY', 're_kkdemo')
    const store = new EnvPerOrgSecretsStore()

    // Control: the mapped org resolves under this exact env.
    expect(await store.get(CNDN, 'email')).toEqual({ apiKey: 're_cndn' })
    // `kkdemo.org` is a real organization document — it is simply not mapped,
    // so its variable is inert. Adding a tenant is a code change, on purpose.
    expect(await store.get('kkdemo.org', 'email')).toBeNull()
    expect(
      await store.get('organization-cloud-native-days-2', 'email'),
    ).toBeNull()
    expect(await store.get(` ${CNDN}`, 'email')).toBeNull()
    expect(await store.get(CNDN.toUpperCase(), 'email')).toBeNull()
  })

  it('refuses an unresolvable org (null / undefined / empty)', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    const store = new EnvPerOrgSecretsStore()

    expect(await store.get(CNDN, 'email')).not.toBeNull()
    for (const orgId of [null, undefined, '']) {
      expect(await store.get(orgId, 'email')).toBeNull()
      expect(await store.get(orgId, 'ticketing')).toBeNull()
    }
  })

  it('refuses every family with no wired discrete-var consumer', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    // Names an operator might guess. They are NOT part of the contract, and a
    // store that half-honoured them would be worse than one that ignores them.
    vi.stubEnv('TENANT_CNDN_SLACK_BOT_TOKEN', 'xoxb-cndn')
    vi.stubEnv('TENANT_CNDN_PUSH_PUBLIC_KEY', 'pub')
    vi.stubEnv('TENANT_CNDN_BADGE_ED25519_SEED', 'seed')
    const store = new EnvPerOrgSecretsStore()

    expect(await store.get(CNDN, 'email')).not.toBeNull()
    for (const family of ['slack', 'push', 'badge'] as SecretFamily[]) {
      expect(await store.get(CNDN, family)).toBeNull()
    }
  })

  it('reads process.env at CALL time, not import time', async () => {
    clearTenantVars()
    const store = new EnvPerOrgSecretsStore()
    expect(await store.get(CNDN, 'email')).toBeNull()
    // Set AFTER construction — a module-load read would miss this.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_late')
    expect(await store.get(CNDN, 'email')).toEqual({ apiKey: 're_late' })
    // …and a rotation is picked up without a restart of the store object.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_rotated')
    expect(await store.get(CNDN, 'email')).toEqual({ apiKey: 're_rotated' })
  })
})

/**
 * CHAIN PRECEDENCE. Discrete vars win over `TENANT_SECRETS_JSON`, which wins
 * over the platform env — and the platform env still reaches nobody but the
 * platform org.
 */
describe('DEFAULT_SECRETS_CHAIN precedence', () => {
  const PLATFORM = 'org-platform'

  it('puts the discrete-var store FIRST', () => {
    expect(DEFAULT_SECRETS_CHAIN).toHaveLength(3)
  })

  it('discrete vars beat a TENANT_SECRETS_JSON entry for the same org/family', async () => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ [CNDN]: { email: { apiKey: 're_blob' } } }),
    )

    // Control: with no discrete var, the blob is what resolves.
    expect(await resolveTenantSecrets(CNDN, 'email')).toEqual({
      apiKey: 're_blob',
    })
    // Setting the discrete var takes effect immediately — the operator does not
    // have to empty the blob first for the cutover to be visible.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_discrete')
    expect(await resolveTenantSecrets(CNDN, 'email')).toEqual({
      apiKey: 're_discrete',
    })
  })

  it('falls through to the blob for a family the discrete store does not serve', async () => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_discrete')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({ [CNDN]: { slack: { botToken: 'xoxb-blob' } } }),
    )
    expect(await resolveTenantSecrets(CNDN, 'email')).toEqual({
      apiKey: 're_discrete',
    })
    expect(await resolveTenantSecrets(CNDN, 'slack')).toEqual({
      botToken: 'xoxb-blob',
    })
  })

  it('leaves an org with NO per-org vars resolving exactly as before', async () => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv('TENANT_SECRETS_JSON', '')

    // The platform org still reaches the platform env…
    expect(await resolveTenantSecrets(PLATFORM, 'email')).toEqual({
      apiKey: 're_platform',
    })
    // …and every other tenant still gets nothing, exactly as under #844.
    expect(await resolveTenantSecrets('org-other', 'email')).toBeNull()
    expect(await resolveTenantSecrets(CNDN, 'email')).toBeNull()
  })

  it('never lets the new store hand out the platform env to a mapped org', async () => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv('TENANT_SECRETS_JSON', '')
    // Being MAPPED grants nothing on its own — only a set variable does.
    expect(await resolveTenantSecrets(CNDN, 'email')).toBeNull()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    const resolved = await resolveTenantSecrets(CNDN, 'email')
    expect(resolved).toEqual({ apiKey: 're_cndn' })
    expect(resolved?.apiKey).not.toBe('re_platform')
  })
})
