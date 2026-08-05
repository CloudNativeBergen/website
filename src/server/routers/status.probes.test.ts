import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

const postSlackMessageMock = vi.fn()
vi.mock('@/lib/slack/client', () => ({
  postSlackMessage: (...args: unknown[]) => postSlackMessageMock(...args),
  escapeMrkdwn: (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}))

/**
 * The token resolver is mocked at ITS boundary — the isolation rules it enforces
 * are proven in `src/lib/slack/token.test.ts`. What matters here is that the
 * probe consults it FIRST and reports `notEnabled` when it yields nothing,
 * instead of attempting a send and blaming the channel configuration.
 */
const resolveSlackTokenMock = vi.fn()
vi.mock('@/lib/slack/token', () => ({
  resolveConferenceSlackToken: (...args: unknown[]) =>
    resolveSlackTokenMock(...args),
}))

const createOrReplaceMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    createOrReplace: (...args: unknown[]) => createOrReplaceMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
  clientReadUncached: { fetch: vi.fn() },
}))

const sendMock = vi.fn()
vi.mock('@/lib/email/config', () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
}))

import { statusRouter } from './status'

/** The org the domain-resolved conference belongs to. */
const ORG_ID = 'org-test'

/**
 * Org-scoped authz keys on `organizerOrgIds` ALONE (the global `isOrganizer`
 * bridge is gone), so an "organizer" caller must carry the SAME org the
 * request's domain conference resolves to — hence `ORG_ID` on both sides.
 */
function makeCaller(opts: { isOrganizer?: boolean; speakerId?: string } = {}) {
  const isOrganizer = opts.isOrganizer ?? true
  const speaker = {
    _id: opts.speakerId ?? 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    isOrganizer,
    organizerOrgIds: isOrganizer ? [ORG_ID] : [],
  }
  const ctx = {
    session: { speaker, user: { name: 'Admin' } },
    speaker,
  } as unknown as Context
  return statusRouter.createCaller(ctx)
}

const CONFERENCE = {
  _id: 'conf-1',
  // The org the authz waist resolves off the domain conference; must match the
  // caller's `organizerOrgIds` for `adminProcedure` to admit the request.
  organization: { _type: 'reference', _ref: ORG_ID },
  organizer: 'Test Org',
  cfpEmail: 'cfp@example.com',
  salesNotificationChannel: '#updates',
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({ conference: CONFERENCE, error: null })
  resolveSlackTokenMock.mockResolvedValue('xoxb-resolved')
})

describe('status.admin probes — auth gate', () => {
  it('rejects a non-organizer', async () => {
    const caller = makeCaller({ isOrganizer: false, speakerId: 'nonorg' })
    await expect(caller.admin.probeSlack()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(postSlackMessageMock).not.toHaveBeenCalled()
  })
})

describe('status.admin.probeSlack', () => {
  it('posts to the weekly-update channel and returns ok', async () => {
    postSlackMessageMock.mockResolvedValue(undefined)
    const res = await makeCaller({ speakerId: 'slack-ok' }).admin.probeSlack()
    expect(res).toEqual({ ok: true, channel: '#updates' })
    expect(postSlackMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Admin') }),
      expect.objectContaining({
        channel: '#updates',
        forceSlack: true,
        botToken: 'xoxb-resolved',
      }),
    )
  })

  /**
   * `slack-mirror` is `readiness: 'internal'`, so an org without it is told
   * plainly that Slack is not enabled — no upsell, and no send attempt whose
   * silent no-op used to be reported back as `ok: true, Posted to #channel`.
   */
  it('reports notEnabled — without sending — when no token resolves', async () => {
    resolveSlackTokenMock.mockResolvedValue(undefined)
    const res = await makeCaller({
      speakerId: 'slack-notenabled',
    }).admin.probeSlack()
    expect(res).toEqual({
      ok: false,
      notEnabled: true,
      error: 'Slack is not enabled for this organization.',
    })
    expect(postSlackMessageMock).not.toHaveBeenCalled()
  })

  it('checks entitlement BEFORE the channel, so a non-entitled org is not sent to fix a channel', async () => {
    resolveSlackTokenMock.mockResolvedValue(undefined)
    getConferenceMock.mockResolvedValue({
      conference: { ...CONFERENCE, salesNotificationChannel: undefined },
      error: null,
    })
    const res = await makeCaller({
      speakerId: 'slack-order',
    }).admin.probeSlack()
    expect(res).toMatchObject({ notEnabled: true })
  })

  it('returns an error when no channel is configured', async () => {
    getConferenceMock.mockResolvedValue({
      conference: { ...CONFERENCE, salesNotificationChannel: undefined },
      error: null,
    })
    const res = await makeCaller({
      speakerId: 'slack-nochan',
    }).admin.probeSlack()
    expect(res.ok).toBe(false)
    expect(postSlackMessageMock).not.toHaveBeenCalled()
  })

  it('captures a transport failure without throwing', async () => {
    postSlackMessageMock.mockRejectedValue(new Error('slack 500'))
    const res = await makeCaller({ speakerId: 'slack-err' }).admin.probeSlack()
    expect(res).toEqual({ ok: false, error: 'slack 500' })
  })

  it('enforces a per-organizer cooldown', async () => {
    postSlackMessageMock.mockResolvedValue(undefined)
    const caller = makeCaller({ speakerId: 'slack-cooldown' })
    await caller.admin.probeSlack()
    await expect(caller.admin.probeSlack()).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
  })
})

describe('status.admin.probeEmail', () => {
  it('sends to the caller and returns the resend id plus the sender it proved', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const res = await makeCaller({ speakerId: 'email-ok' }).admin.probeEmail()
    expect(res).toMatchObject({ ok: true, id: 'email-1' })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com' }),
    )
  })

  it('returns the resend error message on failure, naming the sender it used', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'bad key' } })
    const res = await makeCaller({ speakerId: 'email-err' }).admin.probeEmail()
    expect(res.ok).toBe(false)
    expect(res.error).toContain('bad key')
  })

  /**
   * The probe used to send from `cfpEmail` unconditionally. With senders on
   * different domains that made it a green light off a healthy address while
   * another was being rejected — so it now exercises the WORST sender.
   */
  it('sends from the WORST sender, not the first — a healthy address cannot mask a broken one', async () => {
    vi.stubEnv('EMAIL_FALLBACK_FROM', '')
    vi.stubEnv('EMAIL_SENDING_DOMAINS', 'verified.example')
    getConferenceMock.mockResolvedValue({
      conference: {
        ...CONFERENCE,
        contactEmail: 'hello@verified.example',
        cfpEmail: 'cfp@verified.example',
        // The only sender the platform account cannot send as.
        sponsorEmail: 'sponsors@unverified.dev',
      },
      error: null,
    })
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null })

    const res = await makeCaller({
      speakerId: 'email-worst',
    }).admin.probeEmail()

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('sponsors@unverified.dev'),
      }),
    )
    expect(res).toMatchObject({ sentAs: 'Sponsors sponsors@unverified.dev' })
    vi.unstubAllEnvs()
  })
})

describe('status.admin.probeSanityWrite', () => {
  it('round-trips a scratch doc and reports latency', async () => {
    createOrReplaceMock.mockResolvedValue({})
    deleteMock.mockResolvedValue({})
    const res = await makeCaller({
      speakerId: 'sanity-ok',
    }).admin.probeSanityWrite()
    expect(res.ok).toBe(true)
    expect(typeof res.latencyMs).toBe('number')
    expect(createOrReplaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'system.probe', _type: 'systemProbe' }),
    )
    expect(deleteMock).toHaveBeenCalledWith('system.probe')
  })

  it('captures a write failure without throwing', async () => {
    createOrReplaceMock.mockRejectedValue(new Error('write forbidden'))
    const res = await makeCaller({
      speakerId: 'sanity-err',
    }).admin.probeSanityWrite()
    expect(res.ok).toBe(false)
    expect(res.error).toBe('write forbidden')
  })
})
