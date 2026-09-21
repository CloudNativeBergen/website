/**
 * Save as Template (Templates spec §6.1, §6.2), pure: a plan becomes Campaigns
 * and Recipes — never Tasks — and seeding from the result is the same
 * expansion as seeding from the built-in Template.
 */
import { describe, expect, it } from 'vitest'
import type { CopySourceTask } from '../copy'
import { attachEntry, libraryEntry } from '../library'
import { expandTemplate, type SeedConference, type SeedPlan } from '../seed'
import { BUILTIN_TEMPLATE } from '../template'
import {
  buildTemplate,
  savePreview,
  unsavedTargets,
  type SaveSource,
} from './save'

const CONFERENCE: SeedConference = {
  _id: 'conf-2026',
  title: 'Cloud Native Bergen 2026',
  city: 'Bergen',
  venueName: 'Grieghallen',
  baseUrl: 'https://2026.cloudnativebergen.dev',
  ticketCapacity: 400,
  cfpStartDate: '2026-01-12',
  cfpEndDate: '2026-03-02',
  cfpNotifyDate: '2026-04-02',
  programDate: '2026-04-21',
  startDate: '2026-06-11',
  endDate: '2026-06-12',
  earlyBirdEndDate: '2026-05-01',
}
const NEXT: SeedConference = {
  ...CONFERENCE,
  _id: 'conf-2027',
  title: 'Cloud Native Bergen 2027',
  baseUrl: 'https://2027.cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
  earlyBirdEndDate: '2027-05-01',
}

function sourceOf(seed: SeedPlan): SaveSource {
  const variantOf = (id?: string) => seed.variants.find((v) => v._id === id)
  return {
    plan: { _id: seed.plan._id },
    conference: CONFERENCE,
    ticketCapacity: CONFERENCE.ticketCapacity ?? null,
    campaigns: seed.campaigns.map((c) => ({ ...c })),
    tasks: seed.tasks.map((t): CopySourceTask => ({
      _id: t._id,
      campaignId: t.campaignId,
      key: t.key,
      title: t.title,
      kind: t.kind,
      channel: t.channel,
      milestone: t.milestone ?? null,
      offsetDays: t.offsetDays ?? null,
      dueAt: t.dueAt ?? null,
      origin: t.origin,
      prerequisiteIds: t.prerequisiteIds,
      targetPage: t.targetPage ?? null,
      alt: t.alt ?? null,
      instructions: t.instructions ?? null,
      copyEdited: t.copyEdited ?? null,
      variant: variantOf(t.variantId)
        ? {
            body: variantOf(t.variantId)!.body,
            link: variantOf(t.variantId)!.link,
            scheduledAt: variantOf(t.variantId)!.scheduledAt,
          }
        : null,
    })),
  }
}
function seeded(edit: (seed: SeedPlan) => void = () => {}): SaveSource {
  let n = 0
  const seed = expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference: CONFERENCE,
    includeOptional: [],
    ownerId: 'sp-owner',
    now: '2025-09-01T10:00:00.000Z',
    newId: (type) => `${type}.src${++n}`,
  })
  edit(seed)
  return sourceOf(seed)
}
const reseed = (
  source: SaveSource,
  decisions = {},
  includeOptional: string[] = [],
) => {
  let n = 0
  return expandTemplate({
    template: {
      name: 'Ours',
      version: 'template:Ours@1',
      campaigns: buildTemplate(source, decisions),
    },
    conference: NEXT,
    includeOptional,
    ownerId: 'sp-next',
    now: '2026-09-01T10:00:00.000Z',
    newId: (type) => `${type}.new${++n}`,
  })
}

describe('buildTemplate', () => {
  it('an untouched built-in plan saves as the built-in Campaigns and Recipes it was seeded with', () => {
    const campaigns = buildTemplate(seeded(), {})
    const builtin = BUILTIN_TEMPLATE.campaigns.filter((c) => !c.optional)
    expect(campaigns.map((c) => c.key)).toEqual(builtin.map((c) => c.key))
    const cfp = campaigns.find((c) => c.key === 'cfp')!
    const original = builtin.find((c) => c.key === 'cfp')!
    expect(cfp).toMatchObject({
      title: original.title,
      start: original.start,
      end: original.end,
      primaryOutcome: original.primaryOutcome,
      optional: false,
      triggers: original.triggers,
    })
    expect(cfp.recipes).toEqual(original.recipes)
  })
  it('seeds the next edition with the same Campaign and Task keys, so the report compares across editions', () => {
    const source = seeded()
    const next = reseed(source)
    expect(next.campaigns.map((c) => c.key)).toEqual(
      source.campaigns.map((c) => c.key),
    )
    expect(next.tasks.map((t) => t.key).sort()).toEqual(
      source.tasks.map((t) => t.key).sort(),
    )
    expect(next.plan.templateVersion).toBe('template:Ours@1')
    expect(next.tasks.every((t) => t.assigneeId === 'sp-next')).toBe(true)
    expect(next.tasks.every((t) => t.status !== 'done')).toBe(true)
  })
  it('saves a Target as a share of ticket capacity', () => {
    const source = seeded((seed) => {
      seed.campaigns.find((c) => c.key === 'earlyBird')!.target = 100
    })
    expect(
      buildTemplate(source, {}).find((c) => c.key === 'earlyBird')!.target,
    ).toEqual({ shareOfCapacity: 0.25 })
  })
  it('names the Targets it cannot save when the edition has no ticket capacity, instead of dropping them silently', () => {
    const source = seeded((seed) => {
      seed.campaigns.find((c) => c.key === 'earlyBird')!.target = 100
      seed.campaigns.find((c) => c.key === 'cfp')!.target = 80
    })
    expect(unsavedTargets(source)).toEqual([])
    const noCapacity = { ...source, ticketCapacity: null }
    expect(unsavedTargets(noCapacity)).toEqual([
      { campaignTitle: 'CFP', target: 80 },
      { campaignTitle: 'Tickets open / early bird', target: 100 },
    ])
    expect(
      buildTemplate(noCapacity, {}).find((c) => c.key === 'earlyBird')!.target,
    ).toBeUndefined()
  })
  it('leaves out a static Recipe whose Task was deleted, and keeps Library Recipes whatever Tasks exist', () => {
    const source = seeded((seed) => {
      seed.tasks = seed.tasks.filter((t) => t.key !== 'cfpOpen:linkedin')
    })
    const campaigns = buildTemplate(source, {})
    const keys = campaigns
      .find((c) => c.key === 'cfp')!
      .recipes.map((r) => r.key)
    expect(keys).not.toContain('cfpOpen:linkedin')
    expect(keys).toContain('cfpOpen:bluesky')
    expect(
      campaigns.find((c) => c.key === 'speakers')!.recipes.map((r) => r.key),
    ).toEqual(
      expect.arrayContaining(['speakerCardRender', 'speakerCard:bluesky']),
    )
  })
  it('never saves Trigger- or expansion-origin Tasks or outreach — only their Recipes', () => {
    const source = seeded((seed) => {
      const speakers = seed.campaigns.find((c) => c.key === 'speakers')!
      const like = seed.tasks.find((t) => t.kind === 'checklist')!
      seed.tasks.push(
        {
          ...like,
          _id: 'gen-1',
          campaignId: speakers._id,
          key: 'speakerCard:sp-1:bluesky',
          origin: 'trigger',
        },
        {
          ...like,
          _id: 'out-1',
          campaignId: speakers._id,
          key: 'custom-outreach',
          kind: 'speakerOutreach',
          origin: 'manual',
        },
      )
    })
    const keys = buildTemplate(source, {})
      .find((c) => c.key === 'speakers')!
      .recipes.map((r) => r.key)
    expect(keys).not.toContain('speakerCard:sp-1:bluesky')
    expect(keys).not.toContain('custom-outreach')
    // The finalPush countdown Tasks are expansion-origin; its Recipe stays.
    const finalPush = buildTemplate(source, {}).find(
      (c) => c.key === 'finalPush',
    )!
    expect(
      finalPush.recipes.filter((r) => r.beat === 'countdown'),
    ).toHaveLength(1)
    expect(finalPush.recipes.some((r) => /:d-\d+:/.test(r.key))).toBe(false)
  })
  it('turns a manual Task into a static Recipe, in a hand-built Campaign with a Library Recipe', () => {
    const source = seeded((seed) => {
      const entry = libraryEntry('speakerCard')
      const like = seed.campaigns[0]
      seed.campaigns.push({
        ...like,
        _id: 'camp-custom',
        key: 'custom-1111',
        title: 'Community day',
        optional: true,
        generatedKeys: [],
        ...attachEntry({ recipes: [], triggers: [] }, entry, entry.recipes),
      })
      const render = {
        ...seed.tasks.find((t) => t.kind === 'studioRender')!,
        _id: 'manual-render',
        campaignId: 'camp-custom',
        key: 'custom-render',
        title: 'Community day artwork',
        origin: 'manual' as const,
        milestone: 'CONFERENCE_START' as const,
        offsetDays: -20,
        prerequisiteIds: [],
        dueAt: undefined,
        alt: 'Community day poster',
      }
      const post = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
      const variant = seed.variants.find((v) => v._id === post.variantId)!
      seed.variants.push({
        ...variant,
        _id: 'manual-variant',
        body: '',
        // 14 days before the conference, at the Bluesky slot.
        scheduledAt: '2026-05-28T16:00:00.000Z',
      })
      seed.tasks.push(render, {
        ...post,
        _id: 'manual-post',
        campaignId: 'camp-custom',
        key: 'custom-post',
        title: 'Community day announcement',
        origin: 'manual',
        milestone: 'CONFERENCE_START',
        offsetDays: -14,
        prerequisiteIds: ['manual-render'],
        variantId: 'manual-variant',
        instructions: 'Tag the meetup groups.',
        targetPage: '/community',
        alt: undefined,
      })
    })
    const custom = buildTemplate(source, {}).find(
      (c) => c.key === 'custom-1111',
    )!
    expect(custom.optional).toBe(true)
    expect(custom.triggers).toEqual(libraryEntry('speakerCard').triggers)
    expect(custom.recipes.slice(3)).toEqual([
      {
        key: 'custom-render',
        beat: 'custom-render',
        title: 'Community day artwork',
        kind: 'studioRender',
        anchor: { milestone: 'CONFERENCE_START', offsetDays: -20 },
        subjectSource: 'none',
        alt: 'Community day poster',
      },
      {
        key: 'custom-post',
        beat: 'custom-post',
        title: 'Community day announcement',
        kind: 'publishing',
        channel: 'bluesky',
        anchor: { milestone: 'CONFERENCE_START', offsetDays: -14 },
        prerequisites: ['custom-render'],
        targetPage: '/community',
        subjectSource: 'none',
        instructions: 'Tag the meetup groups.',
      },
    ])
    // …and seeding from it is the ordinary expansion: the post waits on the render.
    const next = reseed(source, {}, ['custom-1111'])
    const seededPost = next.tasks.find((t) => t.key === 'custom-post')!
    const seededRender = next.tasks.find((t) => t.key === 'custom-render')!
    expect(seededPost.prerequisiteIds).toEqual([seededRender._id])
    expect(seededPost.origin).toBe('template')
  })
})

describe('savePreview — exactly the Tasks that need a decision', () => {
  it('asks nothing of an untouched plan', () => {
    expect(savePreview(seeded())).toEqual([])
  })
  it('derives an anchor for an unanchored Task from the nearest Milestone the edition set', () => {
    const source = seeded((seed) => {
      const t = seed.tasks.find((t) => t.kind === 'checklist')!
      delete t.milestone
      delete t.offsetDays
      t.dueAt = '2026-03-05T08:00:00.000Z'
      t._id = 'unanchored'
    })
    expect(savePreview(source)).toEqual([
      expect.objectContaining({
        type: 'anchor',
        taskId: 'unanchored',
        anchor: { milestone: 'CFP_CLOSE', offsetDays: 3 },
      }),
    ])
    // Confirmed as derived by default; changed when the organizer says so.
    const find = (decisions = {}) =>
      buildTemplate(source, decisions)
        .flatMap((c) => c.recipes)
        .find(
          (r) =>
            r.key === source.tasks.find((t) => t._id === 'unanchored')!.key,
        )!
    expect(find().anchor).toEqual({ milestone: 'CFP_CLOSE', offsetDays: 3 })
    expect(
      find({
        anchors: { unanchored: { milestone: 'CFP_OPEN', offsetDays: 10 } },
      }).anchor,
    ).toEqual({ milestone: 'CFP_OPEN', offsetDays: 10 })
  })
  it('lists a Task carrying literal copy with its link as {url}, saved verbatim and flagged unless rewritten', () => {
    const source = seeded((seed) => {
      const t = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
      t.copyEdited = true
      const v = seed.variants.find((v) => v._id === t.variantId)!
      v.body = `CFP opens 12 January 2026! ${v.link}`
    })
    const [item] = savePreview(source)
    expect(item).toMatchObject({
      type: 'copy',
      title: 'CFP open',
      text: 'CFP opens 12 January 2026! {url}',
    })
    const recipe = (decisions = {}) =>
      buildTemplate(source, decisions)
        .find((c) => c.key === 'cfp')!
        .recipes.find((r) => r.key === 'cfpOpen:bluesky')!
    expect(recipe()).toMatchObject({
      skeleton: 'CFP opens 12 January 2026! {url}',
      verbatim: true,
    })
    const rewritten = recipe({
      copy: { [item.taskId]: 'CFP opens {date}! {url}' },
    })
    expect(rewritten.skeleton).toBe('CFP opens {date}! {url}')
    expect(rewritten.verbatim).toBeUndefined()
    // The seeded plan carries the flag to the Task.
    const next = reseed(source)
    const seededTask = next.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
    expect(seededTask.verbatimCopy).toBe(true)
    expect(
      next.variants.find((v) => v._id === seededTask.variantId)!.body,
    ).toContain('https://2027.cloudnativebergen.dev/cfp?')
  })
  it('keeps asking about verbatim copy on every later save, so the flag cannot wear off by being ignored', () => {
    const first = seeded((seed) => {
      const t = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
      t.copyEdited = true
      const v = seed.variants.find((v) => v._id === t.variantId)!
      v.body = `CFP opens 12 January 2026! ${v.link}`
    })
    // Edition two: seeded from that Template, the copy never touched.
    const second = sourceOf(reseed(first))
    expect(savePreview(second)).toEqual([
      expect.objectContaining({
        type: 'copy',
        text: 'CFP opens 12 January 2026! {url}',
      }),
    ])
    const again = buildTemplate(second, {})
      .find((c) => c.key === 'cfp')!
      .recipes.find((r) => r.key === 'cfpOpen:bluesky')!
    expect(again).toMatchObject({
      skeleton: 'CFP opens 12 January 2026! {url}',
      verbatim: true,
    })
  })
  it('still counts copy as verbatim when only surrounding whitespace differs', () => {
    const source = seeded((seed) => {
      const t = seed.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
      t.copyEdited = true
      seed.variants.find((v) => v._id === t.variantId)!.body = 'Same words\n'
    })
    const [item] = savePreview(source)
    const recipe = buildTemplate(source, {
      copy: { [item.taskId]: 'Same words' },
    })
      .find((c) => c.key === 'cfp')!
      .recipes.find((r) => r.key === 'cfpOpen:bluesky')!
    expect(recipe.verbatim).toBe(true)
  })
})
