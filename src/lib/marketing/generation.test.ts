/**
 * @vitest-environment node
 *
 * The generation engine against an in-memory plan: Triggers and expansion
 * are idempotent per (Campaign, recipe, subject), a deleted Task stays
 * deleted, a lost revision race retries from what landed, and subject beats
 * are dealt onto the cadence.
 */

const store = vi.hoisted(() => ({
  context: null as null | import('./generation-sanity').GenerationContext,
  commits: [] as import('./generate').TaskRecords[],
  /** Commits to refuse before accepting (a concurrent generator). */
  conflictsToRaise: 0,
}))

vi.mock('./generation-sanity', () => ({
  getGenerationContext: vi.fn(async () =>
    store.context ? structuredClone(store.context) : null,
  ),
  commitGeneratedTasks: vi.fn(
    async (input: {
      campaignId: string
      campaignRev: string
      records: import('./generate').TaskRecords
    }) => {
      const campaign = store.context!.campaigns.find(
        (c) => c._id === input.campaignId,
      )!
      if (store.conflictsToRaise > 0 || campaign._rev !== input.campaignRev) {
        store.conflictsToRaise = Math.max(0, store.conflictsToRaise - 1)
        return false
      }
      campaign._rev = `${campaign._rev}+`
      campaign.generatedKeys.push(...input.records.tasks.map((t) => t.key))
      for (const t of input.records.tasks) {
        const variant = input.records.variants.find(
          (v) => v._id === t.variantId,
        )
        store.context!.tasks.push({
          campaignId: t.campaignId,
          key: t.key,
          channel: t.channel,
          at: variant?.scheduledAt ?? t.dueAt ?? null,
        })
      }
      store.commits.push(input.records)
      return true
    },
  ),
}))
vi.mock('./sanity', () => ({ getPlanView: vi.fn(async () => null) }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generatedTaskId, runGeneration } from './generation'
import type { GenerationSubject } from './expansion'

const CONFERENCE = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  domains: ['cloudnativebergen.dev'],
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

const NOW = '2027-03-20T12:00:00.000Z'

function reset(
  campaigns: string[] = ['sponsorAcquisition', 'speakers', 'programme'],
) {
  store.commits = []
  store.conflictsToRaise = 0
  store.context = {
    plan: { _id: 'marketingPlan.conf-A', ownerId: 'sp-owner' },
    conference: CONFERENCE as never,
    campaigns: campaigns.map((key) => ({
      _id: `camp-${key}`,
      _rev: 'r1',
      key,
      triggers:
        key === 'sponsorAcquisition'
          ? [{ event: 'sponsorSigned', taskRecipeKey: 'sponsorCardRender' }]
          : key === 'speakers'
            ? [
                {
                  event: 'speakerConfirmed',
                  taskRecipeKey: 'speakerCardRender',
                },
              ]
            : [],
      generatedKeys: [],
    })),
    tasks: [],
  }
}

const sponsor: GenerationSubject = {
  _id: 'sponsor-acme',
  type: 'sponsor',
  values: { name: 'Acme', company: 'Acme', tier: 'Gold' },
}
const speaker = (id: string): GenerationSubject => ({
  _id: id,
  type: 'speaker',
  values: { name: id, company: 'Engineer', title: 'A talk' },
})

const signed = () =>
  runGeneration(
    'conf-A',
    [{ kind: 'trigger', event: 'sponsorSigned', subjects: [sponsor] }],
    NOW,
  )

beforeEach(() => reset())

describe('sponsorSigned Trigger', () => {
  it('creates the render and both thank-you posts, due +1 d and +3 d, Prerequisite on the render', async () => {
    const result = await signed()
    expect(result.created).toBe(3)
    const [records] = store.commits
    expect(records.tasks.map((t) => t.key)).toEqual([
      'sponsorCardRender:sponsor-acme',
      'sponsorCard:sponsor-acme:linkedin',
      'sponsorCard:sponsor-acme:bluesky',
    ])
    const [render, li, bs] = records.tasks
    expect(render).toMatchObject({
      kind: 'studioRender',
      origin: 'trigger',
      status: 'open',
      assigneeId: 'sp-owner',
      subject: { _id: 'sponsor-acme', type: 'sponsor' },
      dueAt: '2027-03-21T08:00:00.000Z',
    })
    expect(render.milestone).toBeUndefined()
    expect(render._id).toBe(
      generatedTaskId('camp-sponsorAcquisition', render.key),
    )
    expect(li.prerequisiteIds).toEqual([render._id])
    expect(bs.prerequisiteIds).toEqual([render._id])
    expect(records.variants.map((v) => [v.status, v.scheduledAt])).toEqual([
      ['draft', '2027-03-23T07:00:00.000Z'],
      ['draft', '2027-03-23T17:00:00.000Z'],
    ])
    expect(records.variants[1].body).toContain('Gold sponsor: Acme')
  })

  it('is idempotent: the closed-won half after contract-signed creates nothing', async () => {
    await signed()
    const again = await signed()
    expect(again.created).toBe(0)
    expect(store.commits).toHaveLength(1)
  })

  it('never recreates a Task the organizer deleted', async () => {
    await signed()
    // Deleting a Task removes the document, never the marker.
    store.context!.tasks = []
    expect((await signed()).created).toBe(0)
  })

  it('does nothing when the plan has no Campaign with the Trigger (optional Campaign left out)', async () => {
    reset(['speakers'])
    expect((await signed()).created).toBe(0)
  })

  it('does nothing without a plan', async () => {
    store.context = null
    expect(await signed()).toMatchObject({ created: 0, skipped: 'no-plan' })
  })

  it('retries a lost revision race from a fresh read and creates once', async () => {
    store.conflictsToRaise = 2
    expect((await signed()).created).toBe(3)
    expect(store.commits).toHaveLength(1)
  })

  it('gives up after repeated conflicts without throwing', async () => {
    store.conflictsToRaise = 10
    expect(await signed()).toMatchObject({ created: 0, skipped: 'conflicts' })
  })
})

describe('speakerConfirmed Trigger and speaker expansion', () => {
  const confirm = (...ids: string[]) =>
    runGeneration(
      'conf-A',
      [
        {
          kind: 'trigger',
          event: 'speakerConfirmed',
          subjects: ids.map(speaker),
        },
      ],
      NOW,
    )

  it('dates a confirmed speaker on the next free cadence slot', async () => {
    await confirm('ada')
    const [records] = store.commits
    expect(records.tasks.map((t) => t.key)).toEqual([
      'speakerCardRender:ada',
      'speakerCard:ada:linkedin',
      'speakerCard:ada:bluesky',
    ])
    // Speaker cards run from CFP_NOTIFY +1 wk (2027-04-08).
    expect(records.variants.map((v) => v.scheduledAt)).toEqual([
      '2027-04-08T06:00:00.000Z',
      '2027-04-08T16:00:00.000Z',
    ])
    expect(records.tasks.every((t) => t.origin === 'trigger')).toBe(true)
  })

  it('deals the next speaker onto the next slot, across runs', async () => {
    await confirm('ada')
    await confirm('grace')
    const grace = store.commits[1]
    // LinkedIn 2/wk: 04-08, 04-11; Bluesky 3/wk: 04-08, 04-10.
    expect(grace.variants.map((v) => v.scheduledAt)).toEqual([
      '2027-04-11T06:00:00.000Z',
      '2027-04-10T16:00:00.000Z',
    ])
  })

  it('lets the expansion cover the same speaker without duplicating', async () => {
    await confirm('ada')
    const result = await runGeneration(
      'conf-A',
      [
        {
          kind: 'expansion',
          list: 'confirmedSpeakers',
          subjects: [speaker('ada'), speaker('grace')],
        },
      ],
      NOW,
    )
    expect(result.created).toBe(3)
    expect(store.commits[1].tasks.every((t) => t.key.includes(':grace'))).toBe(
      true,
    )
    expect(store.commits[1].tasks.every((t) => t.origin === 'expansion')).toBe(
      true,
    )
  })

  it('creates nothing once the cadence window is over', async () => {
    const late = await runGeneration(
      'conf-A',
      [
        {
          kind: 'trigger',
          event: 'speakerConfirmed',
          subjects: [speaker('ada')],
        },
      ],
      '2027-06-09T12:00:00.000Z',
    )
    expect(late.created).toBe(0)
  })

  it('commits a long list in chunks, one Campaign revision at a time', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `sp${i}`)
    const result = await runGeneration(
      'conf-A',
      [
        {
          kind: 'expansion',
          list: 'confirmedSpeakers',
          subjects: ids.map(speaker),
        },
      ],
      NOW,
    )
    expect(result.created).toBe(45 * 3)
    expect(store.commits.map((c) => c.tasks.length)).toEqual([60, 60, 15])
  })
})

describe('talk expansion', () => {
  it('expands talk teasers over scheduled talks in the Programme Campaign', async () => {
    const result = await runGeneration(
      'conf-A',
      [
        {
          kind: 'expansion',
          list: 'scheduledTalks',
          subjects: [
            {
              _id: 'talk-1',
              type: 'talk',
              values: { title: 'Pods', name: 'Ada' },
            },
          ],
        },
      ],
      NOW,
    )
    expect(result.created).toBe(2)
    expect(store.commits[0].tasks.map((t) => t.key)).toEqual([
      'talkTeaser:talk-1:linkedin',
      'talkTeaser:talk-1:bluesky',
    ])
  })
})
