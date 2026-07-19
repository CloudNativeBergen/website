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

function makeCaller(opts: { isOrganizer?: boolean; speakerId?: string } = {}) {
  const speaker = {
    _id: opts.speakerId ?? 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    isOrganizer: opts.isOrganizer ?? true,
  }
  const ctx = {
    session: { speaker, user: { name: 'Admin' } },
    speaker,
  } as unknown as Context
  return statusRouter.createCaller(ctx)
}

const CONFERENCE = {
  _id: 'conf-1',
  organizer: 'Test Org',
  cfpEmail: 'cfp@example.com',
  salesNotificationChannel: '#updates',
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({ conference: CONFERENCE, error: null })
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
      expect.objectContaining({ channel: '#updates', forceSlack: true }),
    )
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
  it('sends to the caller and returns the resend id', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const res = await makeCaller({ speakerId: 'email-ok' }).admin.probeEmail()
    expect(res).toEqual({ ok: true, id: 'email-1' })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com' }),
    )
  })

  it('returns the resend error message on failure', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'bad key' } })
    const res = await makeCaller({ speakerId: 'email-err' }).admin.probeEmail()
    expect(res).toEqual({ ok: false, error: 'bad key' })
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
