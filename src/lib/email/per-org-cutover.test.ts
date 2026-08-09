import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resetSenderPolicyWarnings } from './sender-policy'

/**
 * THE CUTOVER CHECKPOINT (RunKonf/platform#57).
 *
 * The operator sets `TENANT_CNDN_EMAIL_API_KEY` to a key from the **existing**
 * Resend account BEFORE the platform account is swapped. At that instant CNDN
 * must become a DEDICATED sender — its own client, `enforceSenderPolicy` false,
 * decision `'dedicated'` — pointing at the SAME account it already uses. So
 * nothing observable changes for CNDN's mail, and every later step of the
 * cutover happens against a tenant that is already off the shared tier.
 *
 * The converse is the other half: an org with NO per-org variables must resolve
 * exactly as it does today.
 *
 * WHY THE `resend` MODULE IS MOCKED HERE. The transport is the boundary — the
 * claim under test is about which CLIENT is chosen and which policy that client
 * carries, not about anything the Resend SDK does. The fake records the API key
 * each client was constructed with (so "the same account" is an assertion, not
 * an argument) and the message that actually left (so "policy bypassed" is
 * asserted on a VALUE, not on a flag).
 */

const CNDN = 'organization-cloud-native-days'

/** A key on the EXISTING Resend account — a second key, not the platform's. */
const EXISTING_ACCOUNT_KEY = 're_cndn_existing_account'

const PLATFORM_FROM = 'Konf <noreply@platform.example>'
const CNDN_FROM = 'Cloud Native Days <hei@cloudnativebergen.dev>'

interface Sent {
  apiKey: string
  payload: { from?: string; replyTo?: string | string[]; to?: unknown }
}

const h = vi.hoisted(() => ({
  sent: [] as Sent[],
  result: { data: { id: 'email_1' } } as { data?: unknown; error?: unknown },
}))

vi.mock('resend', () => {
  class Resend {
    apiKey: string
    emails: {
      send: (payload: Sent['payload']) => Promise<unknown>
      create: (payload: Sent['payload']) => Promise<unknown>
    }
    constructor(apiKey: string) {
      this.apiKey = apiKey
      const send = async (payload: Sent['payload']) => {
        h.sent.push({ apiKey, payload })
        return h.result
      }
      this.emails = { send, create: send }
    }
  }
  return { Resend }
})

// Imported AFTER the mock declaration (vi.mock is hoisted above it anyway), so
// the module-scope platform client is built from the fake.
const { resolveEmailSender, resend, EMAIL_CONFIG } = await import('./config')

/** The API key a client was constructed with — i.e. WHICH ACCOUNT it sends on. */
function accountOf(client: unknown): string {
  return (client as { apiKey: string }).apiKey
}

function clearTenantVars() {
  vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', '')
  vi.stubEnv('TENANT_CNDN_EMAIL_FROM', '')
  vi.stubEnv('TENANT_SECRETS_JSON', '')
}

beforeEach(() => {
  h.sent.length = 0
  h.result = { data: { id: 'email_1' } }
  resetSenderPolicyWarnings()
  // CNDN is the platform org on this deployment — which is precisely why the
  // checkpoint is worth pinning: today it reaches the platform account through
  // the platform-org branch, and after the cutover it must reach its own.
  vi.stubEnv('PLATFORM_ORG_ID', CNDN)
  vi.stubEnv('EMAIL_FALLBACK_FROM', PLATFORM_FROM)
  vi.stubEnv('EMAIL_SENDING_DOMAINS', '')
  clearTenantVars()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const MESSAGE = {
  from: CNDN_FROM,
  to: 'speaker@example.com',
  subject: 'Your talk',
  html: '<p>hi</p>',
}

describe('the cutover checkpoint: TENANT_CNDN_EMAIL_API_KEY makes CNDN dedicated', () => {
  it('routes CNDN to its OWN client on the key the operator set', async () => {
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)

    const sender = await resolveEmailSender(CNDN)

    // Not the shared platform instance…
    expect(sender.client).not.toBe(resend)
    // …and it sends on the account the operator named. This is the "same
    // account it already uses" half of the checkpoint: the value is asserted,
    // so a client silently built from the platform key would fail here.
    expect(accountOf(sender.client)).toBe(EXISTING_ACCOUNT_KEY)
    expect(accountOf(resend)).toBe(EMAIL_CONFIG.RESEND_API_KEY)
    expect(accountOf(sender.client)).not.toBe(EMAIL_CONFIG.RESEND_API_KEY)
  })

  it('bypasses the sender policy — the From leaves EXACTLY as asked', async () => {
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)

    const sender = await resolveEmailSender(CNDN)
    await sender.client.emails.send(MESSAGE)

    expect(h.sent).toHaveLength(1)
    // `enforceSenderPolicy: false` asserted on the MESSAGE THAT LEFT.
    expect(h.sent[0].payload.from).toBe(CNDN_FROM)
    expect(h.sent[0].payload.from).not.toContain('platform.example')
    expect(h.sent[0].payload.replyTo).toBeUndefined()

    // THE CONTROL, under the IDENTICAL env: the platform client DOES rewrite
    // this exact From. Without this pair, the assertions above would also pass
    // if the policy were simply inert (no fallback configured), which would
    // prove nothing about the dedicated path.
    await resend.emails.send(MESSAGE)
    expect(h.sent[1].payload.from).toBe(
      'Cloud Native Days <noreply@platform.example>',
    )
    expect(h.sent[1].payload.replyTo).toBe('hei@cloudnativebergen.dev')
  })

  it('labels the tenant decision "dedicated" in the failure log', async () => {
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.result = { error: { name: 'application_error', message: 'nope' } }

    const sender = await resolveEmailSender(CNDN)
    await sender.client.emails.send(MESSAGE)

    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][1]).toMatchObject({
      orgId: CNDN,
      senderPolicy: 'dedicated',
    })
  })

  it('carries TENANT_CNDN_EMAIL_FROM as the tenant default From', async () => {
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)
    vi.stubEnv('TENANT_CNDN_EMAIL_FROM', CNDN_FROM)
    expect((await resolveEmailSender(CNDN)).from).toBe(CNDN_FROM)
  })

  it('stays on the platform account until the API key is set — a lone FROM is not a cutover', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('TENANT_CNDN_EMAIL_FROM', CNDN_FROM)

    const half = await resolveEmailSender(CNDN)
    // A partial configuration must NOT produce a client on `{apiKey: undefined}`
    // — that would fall back to the platform key inside `getResendClient` while
    // *looking* provisioned. It resolves to the platform client and no From.
    expect(half.client).toBe(resend)
    expect(half.from).toBeUndefined()

    // The control: completing the pair flips it.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)
    const whole = await resolveEmailSender(CNDN)
    expect(whole.client).not.toBe(resend)
    expect(whole.from).toBe(CNDN_FROM)
  })
})

describe('the converse: no per-org vars resolves exactly as today', () => {
  it('leaves CNDN itself on the platform client when nothing is set', async () => {
    const sender = await resolveEmailSender(CNDN)
    expect(sender.client).toBe(resend)
    expect(sender.from).toBeUndefined()
  })

  it('leaves every other org — mapped or not, resolvable or not — unchanged', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)

    // The shared T0 tier is untouched for everyone who is not CNDN, EVEN with
    // CNDN's variable set — the map is the only thing that binds a var to an org.
    for (const orgId of [
      'org-platform',
      'kkdemo.org',
      'org-other',
      null,
      undefined,
    ]) {
      expect((await resolveEmailSender(orgId)).client).toBe(resend)
    }
    // Control: the mapped org does flip, under the same env.
    expect((await resolveEmailSender(CNDN)).client).not.toBe(resend)
  })

  it('keeps a TENANT_SECRETS_JSON tenant working (the blob is not retired)', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        'org-blob': { email: { apiKey: 're_blob', fallbackFrom: 'a@b.no' } },
      }),
    )
    const sender = await resolveEmailSender('org-blob')
    expect(accountOf(sender.client)).toBe('re_blob')
    expect(sender.from).toBe('a@b.no')
  })
})

/**
 * A KNOWN OPERATOR TRAP, pinned rather than fixed here.
 *
 * `getResendClient` decides "is this the platform client?" by comparing the
 * KEY STRING to `RESEND_API_KEY`. If the operator pastes the *same* key into
 * `TENANT_CNDN_EMAIL_API_KEY` that the platform already uses, the comparison
 * collapses to the cached platform client and CNDN is NOT dedicated — the
 * sender policy stays on and mail keeps being rewritten.
 *
 * That is why the runbook says to mint a SECOND API key on the existing Resend
 * account rather than reusing the platform's. Changing the identity check is a
 * behaviour change in `config.ts` that this PR deliberately does not smuggle in;
 * this test exists so the trap is visible and cannot regress silently.
 */
describe('operator trap: reusing the platform key verbatim', () => {
  it('collapses to the SHARED platform client instead of a dedicated one', async () => {
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EMAIL_CONFIG.RESEND_API_KEY)
    expect((await resolveEmailSender(CNDN)).client).toBe(resend)

    // A DISTINCT key on the same account is what the runbook asks for, and it
    // produces the dedicated client.
    vi.stubEnv('TENANT_CNDN_EMAIL_API_KEY', EXISTING_ACCOUNT_KEY)
    expect((await resolveEmailSender(CNDN)).client).not.toBe(resend)
  })
})
