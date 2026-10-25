/**
 * The speaker briefing procedures (#1592): admin only, and always the
 * conference of the request domain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'a.example.com' : null),
  }),
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

const commit = vi.fn()
const patched = vi.hoisted(() => ({
  id: undefined as string | undefined,
  set: undefined as Record<string, unknown> | undefined,
  unset: undefined as string[] | undefined,
}))
vi.mock('@/lib/sanity/client', () => {
  const tx = {
    createIfNotExists: () => tx,
    patch: () => tx,
    commit: () => commit(),
  }
  return {
    clientWrite: {
      transaction: () => tx,
      patch: (id: string) => {
        patched.id = id
        const builder = {
          setIfMissing: () => builder,
          set: (o: Record<string, unknown>) => {
            patched.set = o
            return builder
          },
          unset: (k: string[]) => {
            patched.unset = k
            return builder
          },
          commit: async () => ({ _id: id }),
        }
        return builder
      },
    },
    clientReadUncached: { fetch: vi.fn(async () => null) },
  }
})
vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

const b = vi.hoisted(() => ({
  load: vi.fn(),
  send: vi.fn(),
  sendTest: vi.fn(),
  render: vi.fn(async () => '<html>'),
  history: vi.fn(async () => ({ entries: [], currentCount: 0 })),
  token: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/lib/email/speaker-briefing', () => ({
  briefingVersion: () => 'v1',
  loadBriefingSpeakers: b.load,
  sendSpeakerBriefings: b.send,
  sendSpeakerBriefingTest: b.sendTest,
  renderSpeakerBriefing: b.render,
  getBriefingSendHistory: b.history,
}))
vi.mock('@/lib/slack/token', () => ({ resolveConferenceSlackToken: b.token }))
vi.mock('@/lib/slack/client', async (original) => ({
  ...(await original<typeof import('@/lib/slack/client')>()),
  postSlackMessage: b.post,
}))

import { conferenceRouter } from './conference'

const ORG = 'org-A'
const CONFERENCE = {
  _id: 'conf-A',
  title: 'Conf A',
  domains: ['a.example.com'],
  organization: { _type: 'reference', _ref: ORG },
  speakerSlackChannel: '#cndn-2026-speakers',
}

function caller(isOrganizer = true, orgIds = [ORG]) {
  const speaker = {
    _id: 'org-1',
    name: 'Org',
    email: 'org@a.example.com',
    isOrganizer,
    organizerOrgIds: orgIds,
  }
  return conferenceRouter.createCaller({
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context)
}

const SPEAKER = { _id: 'sp-1', name: 'Ada', email: 'a@x', proposals: [] }

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: CONFERENCE,
    domain: 'a.example.com',
    error: null,
  })
  b.load.mockResolvedValue([SPEAKER])
  b.send.mockResolvedValue({ sent: 1, skipped: 0, failed: [] })
})

describe('speaker briefing procedures', () => {
  it('sends to the domain conference speakers', async () => {
    await caller().sendBriefing()
    expect(b.load).toHaveBeenCalledWith(CONFERENCE)
    expect(b.send).toHaveBeenCalledWith(CONFERENCE, [SPEAKER], undefined, {
      note: undefined,
      force: undefined,
    })
  })

  it('refuses an organizer of another org', async () => {
    await expect(caller(true, ['org-B']).sendBriefing()).rejects.toThrow()
    await expect(caller(false, []).previewBriefing({})).rejects.toThrow()
    expect(b.send).not.toHaveBeenCalled()
  })

  it('previews only a confirmed speaker of this conference', async () => {
    await expect(
      caller().previewBriefing({ speakerId: 'sp-other-conf' }),
    ).rejects.toThrow(/Not a confirmed speaker/)
    await caller().previewBriefing({ speakerId: 'sp-1' })
    expect(b.render).toHaveBeenCalledWith(CONFERENCE, SPEAKER, false, undefined)
  })

  it('sends the test to the signed-in organizer, as the chosen speaker', async () => {
    await caller().sendBriefingTest()
    expect(b.sendTest).toHaveBeenLastCalledWith(
      CONFERENCE,
      'org@a.example.com',
      expect.objectContaining({ name: 'Sample Speaker' }),
      undefined,
    )
    await caller().sendBriefingTest({ speakerId: 'sp-1' })
    expect(b.sendTest).toHaveBeenLastCalledWith(
      CONFERENCE,
      'org@a.example.com',
      SPEAKER,
      undefined,
    )
    await expect(
      caller().sendBriefingTest({ speakerId: 'sp-other-conf' }),
    ).rejects.toThrow(/Not a confirmed speaker/)
    expect(b.send).not.toHaveBeenCalled()
  })

  it('reads the conference uncached', async () => {
    await caller().sendBriefing()
    expect(getConferenceMock).toHaveBeenCalledWith({ uncached: true })
  })

  it('passes mentionChannel into the Slack payload', async () => {
    b.token.mockResolvedValue('xoxb-tenant')
    await caller().postBriefingToSlack({ mentionChannel: true })
    const [message] = b.post.mock.calls[0] as [
      { blocks: { text?: { text: string } }[] },
    ]
    expect(message.blocks[0].text?.text).toMatch(/^<!channel> /)
    await caller().postBriefingToSlack({ mentionChannel: false })
    const [plain] = b.post.mock.calls[1] as [
      { blocks: { text?: { text: string } }[] },
    ]
    expect(plain.blocks[0].text?.text).not.toContain('<!channel>')
  })

  it('posts to Slack with the tenant token, and says to invite the bot', async () => {
    b.token.mockResolvedValue('xoxb-tenant')
    await caller().postBriefingToSlack({ mentionChannel: false })
    expect(b.token).toHaveBeenCalledWith(CONFERENCE)
    expect(b.post).toHaveBeenCalledWith(expect.anything(), {
      channel: 'cndn-2026-speakers',
      botToken: 'xoxb-tenant',
      forceSlack: true,
    })
    b.post.mockRejectedValueOnce(new Error('Slack API error: not_in_channel'))
    await expect(
      caller().postBriefingToSlack({ mentionChannel: false }),
    ).rejects.toThrow(
      'Invite the Slack bot to #cndn-2026-speakers, then post again.',
    )
  })

  it('does not post without a tenant token', async () => {
    b.token.mockResolvedValue(undefined)
    await expect(
      caller().postBriefingToSlack({ mentionChannel: false }),
    ).rejects.toThrow(/Connect the Slack bot/)
    expect(b.post).not.toHaveBeenCalled()
  })

  it('saves only the Speakers Slack Channel, on the domain conference', async () => {
    await caller().updateSpeakerSlackChannel({
      speakerSlackChannel: ' #cndn-2026-speakers ',
    })
    expect(patched.id).toBe('conf-A')
    expect(patched.set).toEqual({ speakerSlackChannel: '#cndn-2026-speakers' })

    await caller().updateSpeakerSlackChannel({ speakerSlackChannel: '' })
    expect(patched.unset).toEqual(['speakerSlackChannel'])

    await expect(
      caller(true, ['org-B']).updateSpeakerSlackChannel({
        speakerSlackChannel: '#x',
      }),
    ).rejects.toThrow()
  })

  it('passes a trimmed note and a forced run, and caps the note', async () => {
    await caller().sendBriefing({
      note: '  Doors open at 8  ',
      force: true,
      runId: 'run12345',
    })
    expect(b.send).toHaveBeenCalledWith(CONFERENCE, [SPEAKER], undefined, {
      note: 'Doors open at 8',
      force: { runId: 'run12345' },
    })
    await expect(caller().sendBriefing({ force: true })).rejects.toThrow()
    await expect(
      caller().sendBriefing({ note: 'x'.repeat(1001) }),
    ).rejects.toThrow()
    await expect(
      caller().previewBriefingSlack({
        mentionChannel: false,
        note: 'x'.repeat(1001),
      }),
    ).rejects.toThrow()
  })
})
