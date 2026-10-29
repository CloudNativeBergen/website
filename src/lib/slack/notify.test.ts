import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the channel each Slack post targets.
const postMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/slack/client', () => ({
  postSlackMessage: (msg: unknown, opts: { channel?: string }) =>
    postMock(msg, opts),
  escapeMrkdwn: (s: string) => s,
}))
vi.mock('@/lib/speaker/sanity', () => ({ getSpeaker: vi.fn() }))

import {
  notifyNewSpeakerMessage,
  notifySponsorAlert,
  notifySponsorMessage,
  notifySponsorRegistrationComplete,
} from './notify'
import type { Conference } from '@/lib/conference/types'

function conf(overrides: Partial<Conference>): Conference {
  return {
    _id: 'conf-1',
    domains: ['cnd.example'],
    cfpNotificationChannel: '#cfp',
    salesNotificationChannel: '#sales',
    ...overrides,
  } as unknown as Conference
}

const speakerArgs = {
  authorName: 'Ada',
  subject: 'Hi',
  excerpt: 'A message',
  adminPath: '/admin/messages/x',
}
const sponsorArgs = {
  authorName: 'Dana',
  sponsorName: 'Acme',
  excerpt: 'A message',
  adminPath: '/admin/messages/y',
}

beforeEach(() => vi.clearAllMocks())

describe('speaker-message Slack — cfp team channel (TEAMS-2)', () => {
  it('falls back to cfpNotificationChannel when no cfp team is configured', async () => {
    await notifyNewSpeakerMessage(speakerArgs, conf({}))
    expect(postMock).toHaveBeenCalledOnce()
    expect(postMock.mock.calls[0][1]).toEqual({ channel: '#cfp' })
  })

  it("uses the cfp team's slackChannel override when set", async () => {
    await notifyNewSpeakerMessage(
      speakerArgs,
      conf({
        teams: [
          { key: 'cfp', title: 'CFP', members: [], slackChannel: '#cfp-team' },
        ],
      }),
    )
    expect(postMock.mock.calls[0][1]).toEqual({ channel: '#cfp-team' })
  })
})

describe('sponsor-message Slack — sponsors team sales channel (TEAMS-2)', () => {
  it('falls back to salesNotificationChannel when no sponsors team is configured', async () => {
    await notifySponsorMessage(sponsorArgs, conf({}))
    expect(postMock).toHaveBeenCalledOnce()
    expect(postMock.mock.calls[0][1]).toEqual({ channel: '#sales' })
  })

  it("uses the sponsors team's slackChannel override when set", async () => {
    await notifySponsorMessage(
      sponsorArgs,
      conf({
        teams: [
          {
            key: 'sponsors',
            title: 'Sponsors',
            members: [],
            slackChannel: '#spon',
          },
        ],
      }),
    )
    expect(postMock.mock.calls[0][1]).toEqual({ channel: '#spon' })
  })

  it('skips the post entirely when neither a team channel nor a sales channel exists', async () => {
    await notifySponsorMessage(
      sponsorArgs,
      conf({ salesNotificationChannel: undefined }),
    )
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('sponsor alerts (#1687 N1)', () => {
  const alert = {
    sfcId: 'sfc-1',
    sponsorName: 'Acme',
    headline: 'Follow-up date passed',
    detail: 'Due.',
  }
  const text = () => JSON.stringify(postMock.mock.calls[0][0])

  it('names the owner and links to the pipeline view on the sales channel', async () => {
    await notifySponsorAlert({ ...alert, ownerName: 'Ola' }, conf({}))
    expect(postMock.mock.calls[0][1]).toEqual({ channel: '#sales' })
    expect(text()).toContain('Ola')
    expect(text()).toContain(
      'https://cnd.example/admin/sponsors/sfc-1?view=pipeline',
    )
  })

  it('says "No owner assigned" when the sponsor has no owner', async () => {
    await notifySponsorAlert({ ...alert, ownerName: null }, conf({}))
    expect(text()).toContain('No owner assigned')
  })

  it('posts nothing when Slack is not configured for the tenant', async () => {
    await notifySponsorAlert(
      { ...alert, ownerName: 'Ola' },
      conf({ salesNotificationChannel: undefined }),
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('addresses the owner on the registration-complete message', async () => {
    await notifySponsorRegistrationComplete(
      'Acme',
      null,
      null,
      null,
      conf({}),
      {
        sfcId: 'sfc-1',
        ownerName: null,
      },
    )
    expect(text()).toContain('No owner assigned')
    expect(text()).toContain('/admin/sponsors/sfc-1?view=pipeline')
  })
})
