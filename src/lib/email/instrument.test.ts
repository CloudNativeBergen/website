import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Resend } from 'resend'
import { instrumentResendClient } from './instrument'
import { resetSenderPolicyWarnings } from './sender-policy'

/**
 * The choke point (platform#20). Two invariants, both of which a call site must
 * be unable to break: the sender policy is applied to the message that actually
 * leaves, and a failed send is ALWAYS logged with tenant-identifying context —
 * regardless of what the caller does with the result.
 */

const PLATFORM_FROM = 'Konf <noreply@platform.example>'

interface SendCall {
  from: string
  replyTo?: string | string[]
  to: string | string[]
  subject: string
}

function fakeClient(impl: () => Promise<{ data?: unknown; error?: unknown }>): {
  client: Resend
  sent: SendCall[]
  send: ReturnType<typeof vi.fn>
} {
  const sent: SendCall[] = []
  const send = vi.fn(async (payload: SendCall) => {
    sent.push(payload)
    return impl()
  })
  const client = {
    emails: { send, create: send },
  } as unknown as Resend
  return { client, sent, send }
}

const OK = async () => ({ data: { id: 'email_1' } })

beforeEach(() => {
  resetSenderPolicyWarnings()
  vi.stubEnv('EMAIL_FALLBACK_FROM', PLATFORM_FROM)
  vi.stubEnv('EMAIL_SENDING_DOMAINS', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the message that actually leaves', () => {
  it('rewrites an unverified tenant From and sets Reply-To on the PLATFORM client', async () => {
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, {
      orgId: 'org-kcd',
      enforceSenderPolicy: true,
    })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 'Sign in to KCD Bergen',
      html: '<p>hi</p>',
    })

    expect(sent).toHaveLength(1)
    // Assert on the CONSTRUCTED MESSAGE, not on a return value.
    expect(sent[0].from).toBe('KCD Bergen <noreply@platform.example>')
    expect(sent[0].replyTo).toBe('hello@kcd.dev')
    expect(sent[0].from).not.toContain('kcd.dev')
    // Everything else is untouched.
    expect(sent[0].to).toBe('speaker@example.com')
    expect(sent[0].subject).toBe('Sign in to KCD Bergen')
  })

  it('leaves a tenant on a VERIFIED sending domain exactly as it asked', async () => {
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'kcd.dev')
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(sent[0].from).toBe('KCD Bergen <hello@kcd.dev>')
    expect(sent[0].replyTo).toBeUndefined()
  })

  it('does NOT rewrite for a tenant sending on its OWN Resend account', async () => {
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, {
      orgId: 'org-kcd',
      enforceSenderPolicy: false,
    })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(sent[0].from).toBe('KCD Bergen <hello@kcd.dev>')
    expect(sent[0].replyTo).toBeUndefined()
  })

  it('guards `create` too, so the alias is not a way around the policy', async () => {
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.emails.create({
      from: 'hello@kcd.dev',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(sent[0].from).toBe('Konf <noreply@platform.example>')
    expect(sent[0].replyTo).toBe('hello@kcd.dev')
  })
})

/**
 * Header injection, asserted on the message that actually leaves.
 *
 * The stored value is tenant-editable (`contactEmail`/`cfpEmail`/`sponsorEmail`
 * on the conference) and roughly half the send sites interpolate it into the
 * header RAW. The attacker is an authenticated organizer of one tenant, and the
 * platform is multi-tenant, so the reachable payoff is an injected `Bcc:` on
 * another tenant's mail.
 */
describe('a stored CR/LF cannot become a second header on the wire', () => {
  const PAYLOAD = 'hello@kcd.dev\r\nBcc: attacker@evil.example'

  /** Structural: no CR, no LF, exactly one header line. */
  function expectSingleHeaderLine(value: string | string[] | undefined) {
    const values = value === undefined ? [] : [value].flat()
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(v).not.toMatch(/[\r\n]/)
      expect(v.split(/\r\n|\r|\n/)).toHaveLength(1)
    }
  }

  it('strips it from the constructed From and Reply-To', async () => {
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, { enforceSenderPolicy: true })

    // Exactly what `email/speaker.ts` and friends build:
    // `${conference.organizer} <${conference.cfpEmail}>`.
    await client.emails.send({
      from: `KCD Bergen <${PAYLOAD}>`,
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expectSingleHeaderLine(sent[0].from)
    expectSingleHeaderLine(sent[0].replyTo)
    // The injected header cannot exist as a header: there is no second line to
    // put it on, and nothing added a recipient field.
    expect(sent[0]).not.toHaveProperty('bcc')
    expect(sent[0].to).toBe('speaker@example.com')
  })

  it('strips it on the verified-domain path, where the header passes through', async () => {
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'kcd.dev')
    const { client, sent } = fakeClient(OK)
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.emails.send({
      from: `KCD Bergen <${PAYLOAD}>`,
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expectSingleHeaderLine(sent[0].from)
    expect(sent[0]).not.toHaveProperty('bcc')
  })

  it('strips it on a BROADCAST too', async () => {
    const created: Array<{ from: string; replyTo?: string | string[] }> = []
    const create = vi.fn(async (payload: { from: string }) => {
      created.push(payload)
      return { data: { id: 'bc_1' } }
    })
    const client = {
      emails: { send: vi.fn(), create: vi.fn() },
      broadcasts: { create },
    } as unknown as Resend
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.broadcasts.create({
      name: 'Announcement',
      audienceId: 'aud_1',
      from: `KCD Bergen <${PAYLOAD}>`,
      subject: 'Hello',
      html: '<p>hi</p>',
    })

    expectSingleHeaderLine(created[0].from)
    expectSingleHeaderLine(created[0].replyTo)
  })
})

describe('a failed send is never silent', () => {
  it('logs when Resend RETURNS an error, even though the caller ignores it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(async () => ({
      error: {
        name: 'validation_error',
        message: 'The kcd.dev domain is not verified.',
      },
    }))
    instrumentResendClient(client, {
      orgId: 'org-kcd',
      enforceSenderPolicy: true,
    })

    // The caller throws the result away — the classic silent failure.
    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(error).toHaveBeenCalledTimes(1)
    const [message, context] = error.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(message).toBe('[email] send failed')
    // Enough context for an operator to name the tenant …
    expect(context.orgId).toBe('org-kcd')
    expect(context.replyTo).toBe('hello@kcd.dev')
    expect(context.senderPolicy).toBe('platform-rewritten')
    expect(context.recipientDomains).toEqual(['example.com'])
    expect(context.error).toMatchObject({ name: 'validation_error' })
  })

  it('logs when the send THROWS, and still propagates the throw', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('fetch failed')
    const { client } = fakeClient(async () => {
      throw boom
    })
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await expect(
      client.emails.send({
        from: 'KCD Bergen <hello@kcd.dev>',
        to: ['a@example.com', 'b@example.org'],
        subject: 's',
        html: '<p>hi</p>',
      }),
    ).rejects.toBe(boom)

    expect(error).toHaveBeenCalledTimes(1)
    const context = error.mock.calls[0][1] as Record<string, unknown>
    expect(context.recipientDomains).toEqual(['example.com', 'example.org'])
    expect(context.error).toMatchObject({ message: 'fetch failed' })
  })

  it('never puts a recipient address or a subject in the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(async () => ({
      error: { name: 'validation_error', message: 'nope' },
    }))
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'secret-person@example.com',
      subject: 'Sign in to KCD Bergen',
      html: '<p>hi</p>',
    })

    const logged = JSON.stringify(error.mock.calls[0])
    expect(logged).not.toContain('secret-person')
    expect(logged).not.toContain('Sign in to')
  })

  it('logs a failure on a tenant OWN-account client too, labelled as dedicated', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(async () => ({
      error: { name: 'application_error', message: 'nope' },
    }))
    instrumentResendClient(client, {
      orgId: 'org-kcd',
      enforceSenderPolicy: false,
    })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][1]).toMatchObject({
      orgId: 'org-kcd',
      senderPolicy: 'dedicated',
    })
  })

  it('guards BROADCASTS too — the second send API is not a hole in the policy', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const created: Array<{ from: string; replyTo?: string | string[] }> = []
    const create = vi.fn(async (payload: { from: string }) => {
      created.push(payload)
      return { error: { name: 'validation_error', message: 'not verified' } }
    })
    const client = {
      emails: { send: vi.fn(), create: vi.fn() },
      broadcasts: { create },
    } as unknown as Resend
    instrumentResendClient(client, {
      orgId: 'org-kcd',
      enforceSenderPolicy: true,
    })

    await client.broadcasts.create({
      name: 'Announcement',
      audienceId: 'aud_1',
      from: 'KCD Bergen <hello@kcd.dev>',
      subject: 'Hello',
      html: '<p>hi</p>',
    })

    expect(created[0].from).toBe('KCD Bergen <noreply@platform.example>')
    expect(created[0].replyTo).toBe('hello@kcd.dev')
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][0]).toBe('[email] send failed')
  })

  it('says nothing on a successful send', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(OK)
    instrumentResendClient(client, { enforceSenderPolicy: true })

    await client.emails.send({
      from: 'KCD Bergen <hello@kcd.dev>',
      to: 'speaker@example.com',
      subject: 's',
      html: '<p>hi</p>',
    })

    expect(error).not.toHaveBeenCalled()
  })
})
