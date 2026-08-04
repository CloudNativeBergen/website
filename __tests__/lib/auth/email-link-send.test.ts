import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Resend } from 'resend'

/**
 * THE BUG, AT THE PLACE IT BIT (RunKonf/platform#20).
 *
 * A newly provisioned tenant's sign-in mail was addressed `From:` its own,
 * unverified domain and sent on the PLATFORM's Resend key. Resend refused it,
 * and `requestEmailSignInLink` returns the same opaque outcome either way — so
 * the tenant simply could not log in, and nothing said so.
 *
 * These tests pin both halves of the fix on the real send path: the message that
 * leaves carries a platform-verified `From:` with the tenant in `Reply-To:`, and
 * a rejected send is on the record with the conference named.
 */

const { mockResolveEmailSender } = vi.hoisted(() => ({
  mockResolveEmailSender: vi.fn(),
}))

vi.mock('@/lib/email/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/config')>()
  return { ...actual, resolveEmailSender: mockResolveEmailSender }
})

import { instrumentResendClient } from '@/lib/email/instrument'
import { resetSenderPolicyWarnings } from '@/lib/email/sender-policy'
import { sendEmailSignInLink } from '@/lib/auth/email-link/send'
import type { Conference } from '@/lib/conference/types'

const PLATFORM_FROM = 'Konf <noreply@platform.example>'

/** A tenant provisioned on its own domain — unverified on the platform account. */
const TENANT = {
  title: 'KCD Bergen 2026',
  organizer: 'KCD Bergen',
  contactEmail: 'hello@kcd.dev',
  domains: ['2026.kcd.dev'],
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-01',
  socialLinks: [],
} as unknown as Conference

interface SentMessage {
  from: string
  replyTo?: string | string[]
  to: string
  subject: string
}

function stubSender(result: { data?: unknown; error?: unknown }) {
  const sent: SentMessage[] = []
  const send = vi.fn(async (payload: SentMessage) => {
    sent.push(payload)
    return result
  })
  // Shaped like the real thing: the PLATFORM client is shared by every tenant,
  // so it carries no org of its own — the tenant is identified by the sender.
  const client = instrumentResendClient(
    { emails: { send, create: send } } as unknown as Resend,
    { enforceSenderPolicy: true },
  )
  mockResolveEmailSender.mockResolvedValue({ client })
  return sent
}

const REQUEST = {
  to: 'speaker@example.com',
  signInUrl: 'https://2026.kcd.dev/auth/email-link?token=secret-token-value',
  expiresInMinutes: 15,
  singleUse: true,
  conference: TENANT,
  orgId: 'org-kcd',
}

beforeEach(() => {
  resetSenderPolicyWarnings()
  mockResolveEmailSender.mockReset()
  vi.stubEnv('EMAIL_FALLBACK_FROM', PLATFORM_FROM)
  vi.stubEnv('EMAIL_SENDING_DOMAINS', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendEmailSignInLink for a tenant whose own domain is unverified', () => {
  it('sends from the platform-verified sender, with the tenant address as Reply-To', async () => {
    const sent = stubSender({ data: { id: 'email_1' } })

    await expect(sendEmailSignInLink(REQUEST)).resolves.toBe(true)

    expect(sent).toHaveLength(1)
    expect(sent[0].from).toBe('KCD Bergen <noreply@platform.example>')
    expect(sent[0].replyTo).toBe('hello@kcd.dev')
    // The tenant's unverified domain must not appear in the envelope sender —
    // that is exactly the header Resend rejects.
    expect(sent[0].from).not.toContain('kcd.dev')
    // The recipient still sees who it is from.
    expect(sent[0].from).toContain('KCD Bergen')
    expect(sent[0].subject).toBe('Sign in to KCD Bergen 2026')
  })

  it('sends as ITSELF once its domain is a platform sending domain', async () => {
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'kcd.dev')
    const sent = stubSender({ data: { id: 'email_1' } })

    await sendEmailSignInLink(REQUEST)

    expect(sent[0].from).toBe('KCD Bergen <hello@kcd.dev>')
    expect(sent[0].replyTo).toBeUndefined()
  })
})

describe('a tenant-stored CR/LF cannot inject a header into sign-in mail', () => {
  it('produces single-line From and Reply-To from a poisoned contactEmail', async () => {
    const sent = stubSender({ data: { id: 'email_1' } })

    await sendEmailSignInLink({
      ...REQUEST,
      conference: {
        ...TENANT,
        contactEmail: 'hello@kcd.dev\r\nBcc: attacker@evil.example',
      } as unknown as Conference,
    })

    for (const value of [sent[0].from, sent[0].replyTo].flat()) {
      expect(value).not.toMatch(/[\r\n]/)
      expect(String(value).split(/\r\n|\r|\n/)).toHaveLength(1)
    }
    expect(sent[0]).not.toHaveProperty('bcc')
    expect(sent[0].to).toBe('speaker@example.com')
  })
})

describe('a rejected sign-in mail is observable', () => {
  it('logs the conference and the sender at BOTH the client and the sign-in layer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubSender({
      error: { name: 'validation_error', message: 'domain is not verified' },
    })

    // The user-facing contract is unchanged: the caller learns nothing useful.
    await expect(sendEmailSignInLink(REQUEST)).resolves.toBe(false)

    const calls = error.mock.calls
    expect(calls).toHaveLength(2)

    // The client-level line names the tenant by its sender …
    const chokePoint = calls.find((c) => c[0] === '[email] send failed')
    expect(chokePoint?.[1]).toMatchObject({
      from: 'KCD Bergen <noreply@platform.example>',
      replyTo: 'hello@kcd.dev',
      senderPolicy: 'platform-rewritten',
    })

    // … and the sign-in layer adds the conference and the org.
    const signIn = calls.find(
      (c) => c[0] === '[email-link] Resend rejected the sign-in email',
    )
    expect(signIn?.[1]).toMatchObject({
      conference: 'KCD Bergen 2026',
      orgId: 'org-kcd',
      name: 'validation_error',
    })
  })

  it('never writes the sign-in token to the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubSender({ error: { name: 'validation_error', message: 'nope' } })

    await sendEmailSignInLink(REQUEST)

    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-token-value')
  })
})
