// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Op = { op: string; id?: string; arg?: unknown }
const h = vi.hoisted(() => ({
  ops: [] as { op: string; id?: string; arg?: unknown }[],
  commitError: null as null | (Error & { statusCode?: number }),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: {
    transaction: () => {
      const tx = {
        create: (doc: { _id: string }) => {
          h.ops.push({ op: 'create', id: doc._id, arg: doc })
          return tx
        },
        patch: (id: string, fn: (p: unknown) => unknown) => {
          const p: Record<string, (...args: unknown[]) => unknown> = {}
          for (const op of ['ifRevisionId', 'set', 'setIfMissing', 'append'])
            p[op] = (...args: unknown[]) => {
              h.ops.push({ op, id, arg: args.length > 1 ? args : args[0] })
              return p
            }
          fn(p)
          return tx
        },
        delete: (id: string) => {
          h.ops.push({ op: 'delete', id })
          return tx
        },
        commit: async () => {
          if (h.commitError) throw h.commitError
          return {}
        },
      }
      return tx
    },
  },
}))

import { expandTemplate } from '../seed'
import { emptyRecords, materializeTask } from '../materialize'
import { BUILTIN_TEMPLATE } from '../template'
import { libraryEntry } from '.'
import { commitBuiltinCampaign, saveCampaignRecipes } from './sanity'

const speakerCard = libraryEntry('speakerCard')
const base = {
  campaignId: 'camp-1',
  rev: 'rev-1',
  planId: 'plan-1',
  conferenceId: 'conf-A',
  recipes: speakerCard.recipes,
  triggers: speakerCard.triggers,
}
const of = (op: string, id?: string): Op[] =>
  h.ops.filter((o) => o.op === op && (id === undefined || o.id === id))

beforeEach(() => {
  h.ops = []
  h.commitError = null
})

describe('saveCampaignRecipes — forward-only', () => {
  it('writes Recipes and Triggers on the revision it was given, and touches no Task', async () => {
    expect(
      await saveCampaignRecipes({ ...base, records: emptyRecords() }),
    ).toBe(true)
    expect(of('ifRevisionId', 'camp-1').map((o) => o.arg)).toEqual(['rev-1'])
    const set = of('set', 'camp-1')[0].arg as {
      recipes: { _key: string; key: string }[]
      triggers: { _key: string; taskRecipeKey: string }[]
    }
    expect(set.recipes.map((r) => r.key)).toEqual([
      'speakerCardRender',
      'speakerCard:linkedin',
      'speakerCard:bluesky',
    ])
    expect(new Set(set.recipes.map((r) => r._key)).size).toBe(3)
    expect(set.triggers).toEqual([
      expect.objectContaining({
        _key: expect.any(String),
        event: 'speakerConfirmed',
        taskRecipeKey: 'speakerCardRender',
      }),
    ])
    // Only the Campaign and the plan are written: nothing else exists to move.
    expect([...new Set(h.ops.map((o) => o.id))]).toEqual(['camp-1', 'plan-1'])
    expect(of('set', 'plan-1')[0].arg).toMatchObject({
      structurallyEdited: true,
    })
    expect(of('append')).toEqual([])
    expect(of('delete')).toEqual([])
    expect(JSON.stringify(set)).not.toContain('generatedKeys')
  })
  it('creates an expansion’s Tasks and appends exactly their keys to the marker, in the same transaction', async () => {
    const countdown = libraryEntry('countdown').recipes[0]
    const records = materializeTask({
      recipe: countdown,
      taskId: 'task-1',
      key: 'countdown:d-3:bluesky',
      campaign: { _id: 'camp-1', key: 'custom-1' },
      planId: 'plan-1',
      conference: { _id: 'conf-A', baseUrl: 'https://example.com' },
      values: {},
      at: '2027-06-07T16:00:00.000Z',
      anchor: { milestone: 'CONFERENCE_START', offsetDays: -3 },
      provisional: false,
      assigneeId: 'sp-owner',
      prerequisiteIds: [],
      origin: 'expansion',
      newId: (type) => `${type}.1`,
    })
    await saveCampaignRecipes({ ...base, records })
    expect(of('create').map((o) => o.id)).toEqual([
      'socialPost.1',
      'socialPostVariant.1',
      'task-1',
    ])
    expect(of('setIfMissing', 'camp-1')[0].arg).toEqual({ generatedKeys: [] })
    expect(of('append', 'camp-1')[0].arg).toEqual([
      'generatedKeys',
      ['countdown:d-3:bluesky'],
    ])
  })
  it('is false on a lost compare-and-set, and throws anything else', async () => {
    h.commitError = Object.assign(new Error('revision mismatch'), {
      statusCode: 409,
    })
    expect(
      await saveCampaignRecipes({ ...base, records: emptyRecords() }),
    ).toBe(false)
    h.commitError = new Error('network down')
    await expect(
      saveCampaignRecipes({ ...base, records: emptyRecords() }),
    ).rejects.toThrow('network down')
  })
})

describe('commitBuiltinCampaign', () => {
  const seed = () =>
    expandTemplate({
      template: {
        ...BUILTIN_TEMPLATE,
        campaigns: BUILTIN_TEMPLATE.campaigns.filter((c) => c.key === 'cfp'),
      },
      conference: {
        _id: 'conf-A',
        title: 'Conf',
        city: 'Bergen',
        baseUrl: 'https://example.com',
        cfpStartDate: '2027-01-01',
        cfpEndDate: '2027-02-01',
        cfpNotifyDate: '2027-03-01',
        programDate: '2027-04-01',
        startDate: '2027-06-01',
        endDate: '2027-06-02',
      },
      includeOptional: [],
      ownerId: 'sp-owner',
      now: '2026-12-01T00:00:00.000Z',
      newId: (() => {
        let n = 0
        return (type: string) => `${type}.${++n}`
      })(),
    })
  it('creates the Campaign with stored Recipes and its Tasks, guarded on the plan revision, and never creates a plan', async () => {
    const plan = seed()
    expect(await commitBuiltinCampaign(plan, 'plan-rev-1')).toBe(true)
    const created = of('create').map((o) => o.arg as { _type: string })
    expect(created.filter((d) => d._type === 'marketingPlan')).toEqual([])
    const campaign = created.find((d) => d._type === 'marketingCampaign') as {
      _type: string
      key: string
      recipes: unknown[]
    }
    expect(campaign.key).toBe('cfp')
    expect(campaign.recipes).toHaveLength(plan.campaigns[0].recipes.length)
    expect(created.filter((d) => d._type === 'marketingTask')).toHaveLength(
      plan.tasks.length,
    )
    expect(
      of('ifRevisionId', 'marketingPlan.conf-A').map((o) => o.arg),
    ).toEqual(['plan-rev-1'])
  })
  it('is false when another organizer changed the plan first', async () => {
    h.commitError = Object.assign(new Error('revision mismatch'), {
      statusCode: 409,
    })
    expect(await commitBuiltinCampaign(seed(), 'plan-rev-1')).toBe(false)
  })
})
