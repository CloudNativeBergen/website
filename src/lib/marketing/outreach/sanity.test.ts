import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  create: vi.fn(),
  commit: vi.fn(async () => ({})),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const tx = {
        create: (document: unknown) => {
          h.create(document)
          return tx
        },
        patch: () => tx,
        commit: h.commit,
      }
      return tx
    },
  },
}))

import { getOutreachCampaign, resolveOutreachSponsor } from './sanity'
import { materializeTask } from '../materialize'
import { createMarketingTask } from '../sanity'
import { sequentialShortCodes } from '../short-code'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const relation = (
  _id: string,
  conferenceId = 'conf-a',
  sponsorId = 'sponsor-a',
) => ({
  _id,
  _type: 'sponsorForConference',
  conference: ref(conferenceId),
  sponsor: ref(sponsorId),
})

beforeEach(() => {
  vi.clearAllMocks()
  h.dataset = [
    { _id: 'sponsor-a', _type: 'sponsor', name: 'Acme' },
    { _id: 'sponsor-b', _type: 'sponsor', name: 'Other' },
    { _id: 'speaker-a', _type: 'speaker', name: 'Ada' },
    relation('z-live'),
    {
      _id: 'plan-a',
      _rev: 'plan-rev-1',
      _type: 'marketingPlan',
      conference: ref('conf-a'),
      owner: ref('organizer-a'),
    },
    {
      _id: 'campaign-a',
      _type: 'marketingCampaign',
      conference: ref('conf-a'),
      plan: ref('plan-a'),
      key: 'tickets',
    },
  ]
})

describe('outreach scoped persistence', () => {
  it.each([
    ['foreign conference', relation('a-foreign', 'conf-b')],
    ['draft', relation('drafts.a-relationship')],
    ['version', relation('versions.release.a-relationship')],
    ['other sponsor', relation('a-other', 'conf-a', 'sponsor-b')],
  ])('selects the live relationship over a %s decoy', async (_label, decoy) => {
    h.dataset.push(decoy)
    expect(await resolveOutreachSponsor('sponsor-a', 'conf-a')).toEqual({
      _id: 'z-live',
      name: 'Acme',
    })
  })

  it('refuses a relationship whose subject is a speaker instead of a sponsor', async () => {
    h.dataset.push(relation('a-wrong-type', 'conf-a', 'speaker-a'))
    expect(await resolveOutreachSponsor('speaker-a', 'conf-a')).toBeNull()
    expect(await resolveOutreachSponsor('sponsor-a', 'conf-a')).toEqual({
      _id: 'z-live',
      name: 'Acme',
    })
  })

  it('reads a campaign only within both its own and its plan conference', async () => {
    expect(await getOutreachCampaign('campaign-a', 'conf-a')).toEqual({
      _id: 'campaign-a',
      key: 'tickets',
      planId: 'plan-a',
      // Carried so Task creation can compare-and-set on it, making creation and
      // plan/Campaign deletion mutually exclusive in both commit orders.
      planRev: 'plan-rev-1',
      ownerId: 'organizer-a',
    })
    expect(await getOutreachCampaign('campaign-a', 'conf-b')).toBeNull()
    h.dataset.find((doc) => doc._id === 'plan-a')!.conference = ref('conf-b')
    expect(await getOutreachCampaign('campaign-a', 'conf-a')).toBeNull()
  })

  it.each(['drafts.campaign-a', 'versions.release.campaign-a'])(
    'does not read unpublished campaign %s',
    async (id) => {
      h.dataset.push({
        ...h.dataset.find((doc) => doc._id === 'campaign-a'),
        _id: id,
      })
      expect(await getOutreachCampaign(id, 'conf-a')).toBeNull()
      expect(await getOutreachCampaign('campaign-a', 'conf-a')).toMatchObject({
        _id: 'campaign-a',
      })
    },
  )

  it.each(['speakerOutreach', 'sponsorOutreach'] as const)(
    'materializes and persists %s with its subject, destination and initial open status',
    async (kind) => {
      const subject =
        kind === 'speakerOutreach'
          ? { _id: 'speaker-a', type: 'speaker' as const }
          : { _id: 'sponsor-a', type: 'sponsor' as const }
      const records = materializeTask({
        recipe: {
          key: 'share',
          beat: 'share',
          title: 'Share tickets',
          kind,
          targetPage: '/tickets',
          subjectSource: 'none',
        },
        taskId: 'task-a',
        key: 'share',
        campaign: { _id: 'campaign-a', key: 'tickets' },
        planId: 'plan-a',
        conference: { _id: 'conf-a', baseUrl: 'https://conference.test' },
        values: {},
        at: '2026-09-16T10:00:00Z',
        anchor: null,
        provisional: false,
        assigneeId: 'organizer-a',
        prerequisiteIds: [],
        subject,
        origin: 'manual',
        newShortCode: sequentialShortCodes(),
        newId: (type) => `${type}-a`,
      })
      expect(records).toMatchObject({
        tasks: [{ targetPage: '/tickets', subject, status: 'open' }],
        posts: [],
        variants: [],
      })
      expect(await createMarketingTask(records, 'conf-a')).toBe(true)
      expect(h.commit).toHaveBeenCalledTimes(1)
      expect(h.create).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'task-a',
          _type: 'marketingTask',
          kind,
          conference: ref('conf-a'),
          targetPage: '/tickets',
          subject: { ...ref(subject._id), _weak: true },
          status: 'open',
        }),
      )
    },
  )
})
