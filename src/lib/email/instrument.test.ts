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
