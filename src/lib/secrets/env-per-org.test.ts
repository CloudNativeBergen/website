import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  EnvPerOrgSecretsStore,
  TenantEnvSlugUnavailableError,
  resolveTenantEnvSlug,
  tenantEnvVarName,
} from './env-per-org'
import {
  DEFAULT_SECRETS_CHAIN,
  PER_ORG_SECRETS_STORES,
  envPerOrgSecretsStore,
  envSecretsStore,
  perOrgSecretsStore,
  resolveTenantSecrets,
} from './store'
import type { SecretFamily } from './types'

/**
 * PER-ORG DISCRETE ENV VARS (RunKonf/platform#57), with the org → env-slug
 * mapping in `organization.secretEnvSlug` rather than a code constant.
 *
 * TWO properties are under test, and they point in OPPOSITE directions.
 *
 * FAIL CLOSED on a known-empty answer: this store either produces a COMPLETE
 * credential bag for an org that has a slug, or `null`. An org with no slug, a
 * family with no consumer, a half-set of variables — all `null`, so the chain
 * falls through and the consumer takes the same soft-fail path it takes when
 * nothing is configured.
 *
 * FAIL LOUD on an UNKNOWN answer: if the org read fails, or the stored slug is
 * malformed, or two orgs claim the same slug, the store THROWS. It must not
 * answer `null`, because `null` is what makes `resolveEmailSender` hand back
 * the platform Resend client — the exact silent regression to the platform
 * account that moving this mapping into Sanity risks reintroducing.
 *
 * HOW THESE TESTS AVOID PASSING FOR THE WRONG REASON. A bare `toBeNull()` also
 * passes when the env stub silently did nothing, which is the false green that
 * makes a fail-closed test worthless. So every refusal below is asserted
 * ALONGSIDE a positive control under the SAME env, differing only in the one
 * variable under test. Likewise every `rejects` asserts the ERROR TYPE, not
 * merely that something threw.
 */

const CNDN = 'organization-cloud-native-days'
const SLUG = 'CNDN'

/**
 * The organization read, mocked at the module boundary. `env-per-org` reaches
 * it through a DYNAMIC import (to keep `@/lib/organization/sanity` out of the
 * static graph that `@/lib/email/config` drags across the app), which
 * `vi.mock` intercepts just the same.
 */
const org = vi.hoisted(() => ({
  getOrganizationSecretEnvSlugs: vi.fn(),
  readOrganizationSecretEnvSlugs: vi.fn(),
}))
vi.mock('@/lib/organization/sanity', () => org)

/** The production-shaped answer: CNDN holds `CNDN`, nobody else holds anything. */
function orgsAreHealthy() {
  const rows = [{ _id: CNDN, secretEnvSlug: SLUG }]
  org.getOrganizationSecretEnvSlugs.mockResolvedValue(rows)
  org.readOrganizationSecretEnvSlugs.mockResolvedValue(rows)
}

/** BOTH reads fail — the only state that is genuinely "we could not find out". */
function orgReadIsDown(message = 'sanity unavailable') {
  org.getOrganizationSecretEnvSlugs.mockRejectedValue(new Error(message))
  org.readOrganizationSecretEnvSlugs.mockRejectedValue(new Error(message))
}

/** Both reads answer `rows`, cached and uncached alike. */
function orgsAre(rows: { _id: string; secretEnvSlug: string }[]) {
  org.getOrganizationSecretEnvSlugs.mockResolvedValue(rows)
  org.readOrganizationSecretEnvSlugs.mockResolvedValue(rows)
}

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

beforeEach(() => {
  org.getOrganizationSecretEnvSlugs.mockReset()
  org.readOrganizationSecretEnvSlugs.mockReset()
  orgsAreHealthy()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('resolveTenantEnvSlug — the mapping is an operator-only Sanity field', () => {
  it('resolves the slug an organization document carries', async () => {
    await expect(resolveTenantEnvSlug(CNDN)).resolves.toEqual({
      status: 'resolved',
      slug: SLUG,
    })
  })

  /**
   * THE EMPTY-VS-UNKNOWN SPLIT (website#855), which is the whole reason a
   * mutable field is allowed to replace the constant. Both cases below produce
   * "no credentials"; only one of them is an answer.
   */
  it('separates "has no slug" from "could not find out"', async () => {
    // The read SUCCEEDED and this org carries nothing → a real answer.
    await expect(resolveTenantEnvSlug('org-other')).resolves.toEqual({
      status: 'none',
    })

    // The read FAILED → not an answer, and it must not look like one.
    orgReadIsDown()
    const unknown = await resolveTenantEnvSlug(CNDN)
    expect(unknown.status).toBe('unavailable')
    expect(unknown).not.toMatchObject({ status: 'none' })
  })

  it('treats a nullish org as a known "none", never as unknown', async () => {
    for (const orgId of ['', null, undefined]) {
      await expect(resolveTenantEnvSlug(orgId)).resolves.toEqual({
        status: 'none',
      })
    }
    // …and it does not even ask, so a nullish org cannot cost a Sanity read.
    expect(org.getOrganizationSecretEnvSlugs).not.toHaveBeenCalled()
  })

  /**
   * UNIQUENESS, enforced at RESOLUTION time and not only in the Studio. The
   * constant validated this at import; a Sanity field can be written by
   * anything holding a token, so the check has to exist where the value is
   * consumed. Both claimants are refused — letting the first row win is exactly
   * the cross-tenant credential leak the check exists to stop.
   */
  it('refuses BOTH organizations when two claim one slug', async () => {
    orgsAre([
      { _id: CNDN, secretEnvSlug: SLUG },
      { _id: 'org-impostor', secretEnvSlug: SLUG },
    ])
    for (const orgId of [CNDN, 'org-impostor']) {
      const result = await resolveTenantEnvSlug(orgId)
      expect(result.status, orgId).toBe('unavailable')
      expect(result).toMatchObject({ reason: expect.stringContaining(SLUG) })
    }

    // THE CONTROL: drop the impostor and the same org resolves.
    orgsAreHealthy()
    await expect(resolveTenantEnvSlug(CNDN)).resolves.toEqual({
      status: 'resolved',
      slug: SLUG,
    })
  })

  it('collides on a whitespace-padded duplicate rather than coexisting with it', async () => {
    orgsAre([
      { _id: CNDN, secretEnvSlug: SLUG },
      { _id: 'org-impostor', secretEnvSlug: `  ${SLUG}\n` },
    ])
    expect((await resolveTenantEnvSlug(CNDN)).status).toBe('unavailable')
  })

  /**
   * A MALFORMED STORED SLUG IS UNKNOWN, NOT ABSENT. The org plainly means to
   * have its own credentials; we simply cannot name the variables. Answering
   * `none` would put it back on the platform account silently — the same
   * failure as the read blowing up.
   */
  it('refuses a stored slug that could not name an env var', async () => {
    for (const bad of ['cndn', 'CN-DN', 'CN DN', 'CN.DN', 'CNDN!', 'CN_DN']) {
      orgsAre([{ _id: CNDN, secretEnvSlug: bad }])
      const result = await resolveTenantEnvSlug(CNDN)
      expect(result.status, bad).toBe('unavailable')
    }
    // A blank value is genuinely "no slug", not a malformed one.
    orgsAre([{ _id: CNDN, secretEnvSlug: '   ' }])
    await expect(resolveTenantEnvSlug(CNDN)).resolves.toEqual({
      status: 'none',
    })
  })

  it('does not let one org’s malformed slug poison another org’s lookup', async () => {
    orgsAre([
      { _id: 'org-broken', secretEnvSlug: 'cn dn' },
      { _id: CNDN, secretEnvSlug: SLUG },
    ])
    await expect(resolveTenantEnvSlug(CNDN)).resolves.toEqual({
      status: 'resolved',
      slug: SLUG,
    })
    expect((await resolveTenantEnvSlug('org-broken')).status).toBe(
      'unavailable',
    )
  })

  it('tolerates a pasted trailing newline on the stored value', async () => {
    orgsAre([{ _id: CNDN, secretEnvSlug: `  ${SLUG}\n` }])
    await expect(resolveTenantEnvSlug(CNDN)).resolves.toEqual({
      status: 'resolved',
      slug: SLUG,
    })
  })

  it('resolves no slug for an org that is not in the map', async () => {
    for (const orgId of ['kkdemo.org', 'org-unknown']) {
      await expect(resolveTenantEnvSlug(orgId)).resolves.toEqual({
        status: 'none',
      })
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
/**
 * ── THE ONE THAT MATTERS ───────────────────────────────────────────────────
 *
 * Make the org lookup fail, and prove resolution does not quietly resolve to
 * the platform account. Every assertion here is paired with a control under the
 * SAME environment, so none of them can be passing because the env stub did
 * nothing.
 */
describe('a failed org lookup is LOUD, never a silent platform fallback', () => {
  const PLATFORM = 'org-platform'

  beforeEach(() => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv('TENANT_SECRETS_JSON', '')
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
  })

  it('throws a typed error instead of returning null when the org read fails', async () => {
    const store = new EnvPerOrgSecretsStore()
    // CONTROL: under this exact env, a healthy read resolves CNDN's own key.
    await expect(store.get(CNDN, 'email')).resolves.toEqual({
      apiKey: 're_cndn',
    })

    orgReadIsDown()
    await expect(store.get(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })

  /**
   * The FULL CHAIN, not just the store. `resolveTenantSecrets` must not swallow
   * the throw on its way past `perOrgSecretsStore` and `envSecretsStore` — if
   * it did, the caller would receive `null` and every send would move to the
   * platform account with nothing logged.
   */
  it('propagates through resolveTenantSecrets rather than falling to the env store', async () => {
    // CONTROL: the platform org genuinely does resolve the platform key here,
    // so `re_platform` is reachable through this chain and a `null`/platform
    // answer below would be a real regression, not an impossible one.
    await expect(resolveTenantSecrets(PLATFORM, 'email')).resolves.toEqual({
      apiKey: 're_platform',
    })

    orgReadIsDown()
    await expect(resolveTenantSecrets(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
    // Not merely "did not equal the platform bag" — it never produced a value.
    await expect(
      resolveTenantSecrets(CNDN, 'email').catch(() => 'threw'),
    ).resolves.toBe('threw')
  })

  it('is loud for the PLATFORM org too, which is where a null would be worst', async () => {
    // The platform org is the one tenant `envSecretsStore` WILL hand the
    // platform key to. A `null` from the discrete store therefore lands on
    // `re_platform` — a real credential, silently — so this is the case where
    // collapsing unknown into empty does the most damage.
    orgReadIsDown()
    await expect(
      resolveTenantSecrets(PLATFORM, 'email'),
    ).rejects.toBeInstanceOf(TenantEnvSlugUnavailableError)
  })

  it('names the organization and the reason so an operator can act on it', async () => {
    orgReadIsDown()
    const thrown = await new EnvPerOrgSecretsStore()
      .get(CNDN, 'email')
      .then(() => null)
      .catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(TenantEnvSlugUnavailableError)
    const error = thrown as TenantEnvSlugUnavailableError
    expect(error.orgId).toBe(CNDN)
    expect(error.message).toContain(CNDN)
    expect(error.message).toContain('sanity unavailable')
    expect(error.message).toContain('platform account')
  })

  it('is loud for ticketing as well as email', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_CHECKIN_API_KEY', 'ck-key')
    vi.stubEnv('TENANT_CNDN_CHECKIN_API_SECRET', 'ck-secret')
    vi.stubEnv('TENANT_CNDN_CHECKIN_WEBHOOK_SECRET', 'ck-webhook')
    const store = new EnvPerOrgSecretsStore()
    await expect(store.get(CNDN, 'ticketing')).resolves.not.toBeNull()

    orgReadIsDown('boom')
    await expect(store.get(CNDN, 'ticketing')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })

  /**
   * THE BLAST-RADIUS LIMIT, and it is load-bearing: without it a Sanity blip
   * would refuse sends on every deployment in existence, including every local
   * checkout and self-host that has never heard of this mechanism. A deployment
   * with no discrete variable for the family has nothing this store could hand
   * anybody, so it never asks — and therefore can never go loud.
   */
  it('never asks, and never goes loud, on a deployment with no discrete vars', async () => {
    clearTenantVars()
    orgReadIsDown('boom')

    await expect(resolveTenantSecrets(CNDN, 'email')).resolves.toBeNull()
    await expect(resolveTenantSecrets(CNDN, 'ticketing')).resolves.toBeNull()
    await expect(resolveTenantSecrets(PLATFORM, 'email')).resolves.toEqual({
      apiKey: 're_platform',
    })
    expect(org.getOrganizationSecretEnvSlugs).not.toHaveBeenCalled()

    // CONTROL: set one variable and the same failing read is now loud, so the
    // silence above is the short-circuit and not a broken mock.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    await expect(resolveTenantSecrets(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })

  it('goes loud on a DUPLICATE slug, not just on a failed read', async () => {
    orgsAre([
      { _id: CNDN, secretEnvSlug: SLUG },
      { _id: 'org-impostor', secretEnvSlug: SLUG },
    ])
    await expect(resolveTenantSecrets(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })

  it('goes loud on a MALFORMED stored slug, not just on a failed read', async () => {
    orgsAre([{ _id: CNDN, secretEnvSlug: 'cn dn' }])
    await expect(resolveTenantSecrets(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })

  /**
   * The other side of the split, asserted in the SAME describe so the contrast
   * is visible: an org that genuinely has no slug is silent, not loud. If this
   * ever started throwing, every tenant on the shared tier would stop sending.
   */
  it('stays quiet for an org that genuinely has no slug', async () => {
    await expect(resolveTenantSecrets('org-other', 'email')).resolves.toBeNull()
  })

  /**
   * A CACHED-READ FAILURE IS NOT YET AN UNKNOWN. `'use cache'` throws outright
   * when Next's cache scope is absent — a wiring failure, not a Sanity outage —
   * and on this path a throw stops mail. The uncached retry collapses that class
   * into a cache miss, so `unavailable` keeps meaning "Sanity could not answer".
   */
  it('retries uncached before declaring the answer unknown', async () => {
    org.getOrganizationSecretEnvSlugs.mockRejectedValue(
      new Error(
        '`cacheLife()` is only available with the `cacheComponents` config.',
      ),
    )
    org.readOrganizationSecretEnvSlugs.mockResolvedValue([
      { _id: CNDN, secretEnvSlug: SLUG },
    ])

    await expect(resolveTenantSecrets(CNDN, 'email')).resolves.toEqual({
      apiKey: 're_cndn',
    })
    expect(org.readOrganizationSecretEnvSlugs).toHaveBeenCalledTimes(1)

    // THE CONTROL: when the UNCACHED read fails too, it is a real unknown and
    // the store is loud again — so the rescue above cannot be hiding an outage.
    orgReadIsDown()
    await expect(resolveTenantSecrets(CNDN, 'email')).rejects.toBeInstanceOf(
      TenantEnvSlugUnavailableError,
    )
  })
})

/**
 * THE READ IS CACHED, NOT PER-SEND. `getOrganizationSecretEnvSlugs` carries
 * `'use cache'` + `cacheLife('hours')` in production; under vitest that
 * directive is inert, so what is provable HERE is the narrower claim that the
 * resolver adds no read of its own beyond that one call per lookup — and none
 * at all for the families and deployments that cannot use it.
 */
describe('lookup cost', () => {
  it('performs at most one organization read per resolution, and none when it cannot help', async () => {
    clearTenantVars()
    const store = new EnvPerOrgSecretsStore()

    // No discrete vars → no read at all.
    await store.get(CNDN, 'email')
    expect(org.getOrganizationSecretEnvSlugs).toHaveBeenCalledTimes(0)

    // An unserved family → no read either, even with variables present.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    await store.get(CNDN, 'slack')
    expect(org.getOrganizationSecretEnvSlugs).toHaveBeenCalledTimes(0)

    // A served family with variables → exactly one, covering both the org's own
    // slug and the uniqueness check…
    await store.get(CNDN, 'email')
    expect(org.getOrganizationSecretEnvSlugs).toHaveBeenCalledTimes(1)
    // …and the UNCACHED read is not touched on the healthy path, so the retry
    // costs nothing when nothing is wrong.
    expect(org.readOrganizationSecretEnvSlugs).not.toHaveBeenCalled()
  })

  /**
   * `@/lib/organization/sanity` reaches `@/lib/conference/sanity` and most of
   * the app. `./store` refuses that static edge on purpose (it imports
   * `resolvePlatformOrgId` directly rather than `isPlatformOrganization`), and
   * `@/lib/email/config` imports `./store`, so a static import added here would
   * pull the whole graph into every send path.
   */
  it('reaches the organization read through a DYNAMIC import only', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(new URL('./env-per-org.ts', import.meta.url), 'utf8'),
    )
    // A dynamic import of the module is present…
    expect(source).toMatch(
      /await import\(\s*'@\/lib\/organization\/sanity',?\s*\)/,
    )
    // …and no STATIC one is, in any of the forms that would create the edge.
    expect(source).not.toMatch(/^\s*import\b[^\n]*'@\/lib\/organization\//m)
    expect(source).not.toMatch(
      /^\s*export\b[^\n]*from '@\/lib\/organization\//m,
    )
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
  it('refuses an org with NO slug even when identically-named vars exist', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    vi.stubEnv('TENANT_KKDEMO_EMAIL_API_KEY', 're_kkdemo')
    const store = new EnvPerOrgSecretsStore()

    // Control: the org that carries a slug resolves under this exact env.
    expect(await store.get(CNDN, 'email')).toEqual({ apiKey: 're_cndn' })
    // `kkdemo.org` is a real organization document — it simply carries no
    // `secretEnvSlug`, so `TENANT_KKDEMO_EMAIL_API_KEY` is inert. The variable
    // does not confer the binding; the operator-only field does.
    expect(await store.get('kkdemo.org', 'email')).toBeNull()
    expect(
      await store.get('organization-cloud-native-days-2', 'email'),
    ).toBeNull()
    // The org id is matched EXACTLY — no trimming, no case folding.
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
    // Asserted by IDENTITY, not by length: `toHaveLength(3)` alone would pass
    // under any ordering, which is the one thing this test's name claims.
    expect(DEFAULT_SECRETS_CHAIN).toHaveLength(3)
    expect(DEFAULT_SECRETS_CHAIN[0]).toBe(envPerOrgSecretsStore)
    expect(DEFAULT_SECRETS_CHAIN[1]).toBe(perOrgSecretsStore)
    expect(DEFAULT_SECRETS_CHAIN[2]).toBe(envSecretsStore)
    // …and the per-org prefix is the first two, in the same order.
    expect(PER_ORG_SECRETS_STORES).toEqual([
      envPerOrgSecretsStore,
      perOrgSecretsStore,
    ])
  })

  it('refuses an org id that names an Object.prototype member', async () => {
    clearTenantVars()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    const store = new EnvPerOrgSecretsStore()
    // Control: a real binding still resolves.
    expect(await store.get(CNDN, 'email')).not.toBeNull()
    for (const key of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]) {
      await expect(resolveTenantEnvSlug(key)).resolves.toEqual({
        status: 'none',
      })
      expect(await store.get(key, 'email')).toBeNull()
    }
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

  it('never lets the new store hand out the platform env to a bound org', async () => {
    clearTenantVars()
    vi.stubEnv('PLATFORM_ORG_ID', PLATFORM)
    vi.stubEnv('RESEND_API_KEY', 're_platform')
    vi.stubEnv('TENANT_SECRETS_JSON', '')
    // Carrying a secretEnvSlug grants nothing on its own — only a set variable does.
    expect(await resolveTenantSecrets(CNDN, 'email')).toBeNull()
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', 're_cndn')
    const resolved = await resolveTenantSecrets(CNDN, 'email')
    expect(resolved).toEqual({ apiKey: 're_cndn' })
    expect(resolved?.apiKey).not.toBe('re_platform')
  })
})
