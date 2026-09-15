/**
 * Copying a previous edition's plan (spec §3.1 "Copy", #1017), pure: Tasks
 * land on the new edition's Milestones, hand-moved Tasks re-anchor to the
 * nearest Milestone, Trigger and expansion Tasks stay behind, Triggers come
 * along, and copy that was never edited is written for the new edition.
 */
import { describe, it, expect } from 'vitest'
import {
  copyPlan,
  isTemplateText,
  reanchor,
  type CopySource,
  type CopySourceTask,
} from './copy'
import { resolveAllMilestones } from './milestones'
import { expandTemplate, type SeedConference, type SeedPlan } from './seed'
import { BUILTIN_TEMPLATE } from './template'

const LAST_YEAR: SeedConference = {
  _id: 'conf-2026',
  title: 'Cloud Native Bergen 2026',
  city: 'Bergen',
  venueName: 'Grieghallen',
  baseUrl: 'https://2026.cloudnativebergen.dev',
  cfpStartDate: '2026-01-12',
  cfpEndDate: '2026-03-02',
  cfpNotifyDate: '2026-04-02',
  programDate: '2026-04-21',
  startDate: '2026-06-11',
  endDate: '2026-06-12',
  earlyBirdEndDate: '2026-05-01',
}

const THIS_YEAR: SeedConference = {
  _id: 'conf-2027',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  baseUrl: 'https://2027.cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

/** Last year's plan as the copy reads it back from Sanity. */
function lastYearSource(edit: (seed: SeedPlan) => void = () => {}): CopySource {
  let n = 0
  const seed = expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference: LAST_YEAR,
    includeOptional: ['sponsorAcquisition'],
    ownerId: 'sp-last-owner',
    now: '2025-09-01T10:00:00.000Z',
    newId: (type) => `${type}.src${++n}`,
  })
  edit(seed)
  const variantOf = (id?: string) => seed.variants.find((v) => v._id === id)
  return {
    plan: { _id: seed.plan._id },
    conference: LAST_YEAR,
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
      copyEdited: null,
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

function copy(
  source: CopySource = lastYearSource(),
  now = '2026-09-01T10:00:00.000Z',
) {
  let n = 0
  return copyPlan({
    source,
    template: BUILTIN_TEMPLATE,
    conference: THIS_YEAR,
    ownerId: 'sp-new-owner',
    now,
    newId: (type) => `${type}.new${++n}`,
  })
}

const task = (plan: SeedPlan, key: string) =>
  plan.tasks.find((t) => t.key === key)!

describe('reanchor', () => {
  const milestones = resolveAllMilestones(LAST_YEAR)

  it('picks the nearest Milestone and the signed offset to it', () => {
    // CFP_CLOSE 2026-03-02; CFP_NOTIFY 2026-04-02.
    expect(reanchor('2026-03-05', milestones)).toEqual({
      milestone: 'CFP_CLOSE',
      offsetDays: 3,
    })
    expect(reanchor('2026-03-30', milestones)).toEqual({
      milestone: 'CFP_NOTIFY',
      offsetDays: -3,
    })
  })

  it('never anchors to a fallback date, and breaks a tie by Milestone order', () => {
    // EARLY_BIRD_END 2026-05-01 is set; PROGRAM_PUBLISHED is 2026-04-21;
    // 2026-04-26 is five days from both. SPONSOR_DEADLINE falls back to
    // 2026-04-30, nearer, but a guessed date anchors nothing.
    expect(reanchor('2026-04-26', milestones)).toEqual({
      milestone: 'PROGRAM_PUBLISHED',
      offsetDays: 5,
    })
  })

  it('lands on the Milestone itself with offset 0', () => {
    expect(reanchor('2026-06-11', milestones)).toEqual({
      milestone: 'CONFERENCE_START',
      offsetDays: 0,
    })
  })
})

describe('copyPlan — plan and Campaigns', () => {
  it('records where it was copied from, owned by the organizer copying', () => {
    const plan = copy()
    expect(plan.plan).toEqual({
      _id: 'marketingPlan.conf-2027',
      conferenceId: 'conf-2027',
      ownerId: 'sp-new-owner',
      templateVersion: 'copy:marketingPlan.conf-2026',
      copiedFrom: 'marketingPlan.conf-2026',
      createdAt: '2026-09-01T10:00:00.000Z',
    })
  })

  it('copies every Campaign with its Triggers, re-dated against the new edition', () => {
    const plan = copy()
    expect(plan.campaigns.map((c) => c.key)).toEqual(
      lastYearSource().campaigns.map((c) => c.key),
    )
    const sponsor = plan.campaigns.find((c) => c.key === 'sponsorAcquisition')!
    expect(sponsor.triggers).toEqual([
      { event: 'sponsorSigned', taskRecipeKey: 'sponsorCardRender' },
    ])
    const cfp = plan.campaigns.find((c) => c.key === 'cfp')!
    expect(cfp).toMatchObject({
      startDate: '2027-01-10',
      endDate: '2027-03-02',
      provisional: false,
      conferenceId: 'conf-2027',
    })
    // Last year's early-bird end was set; this year's is not → provisional.
    expect(plan.campaigns.find((c) => c.key === 'earlyBird')!.provisional).toBe(
      true,
    )
  })

  it('keeps a Target the organizer set last year', () => {
    const source = lastYearSource()
    source.campaigns.find((c) => c.key === 'cfp')!.target = 120
    expect(copy(source).campaigns.find((c) => c.key === 'cfp')!.target).toBe(
      120,
    )
  })
})

describe('copyPlan — Tasks', () => {
  it('re-dates anchored Tasks by Milestone and offset, as open drafts for the new owner', () => {
    const plan = copy()
    const reminder = task(plan, 'cfpReminder2w:linkedin')
    expect(reminder).toMatchObject({
      milestone: 'CFP_CLOSE',
      offsetDays: -14,
      origin: 'copy',
      assigneeId: 'sp-new-owner',
      conferenceId: 'conf-2027',
    })
    const variant = plan.variants.find((v) => v._id === reminder.variantId)!
    expect(variant).toMatchObject({
      status: 'draft',
      scheduledAt: '2027-02-15T07:00:00.000Z',
    })
    expect(task(plan, 'blueskySetup')).toMatchObject({
      status: 'open',
      dueAt: '2026-12-10T08:00:00.000Z',
    })
  })

  it('re-anchors a hand-moved Task to its nearest Milestone, and flags a fallback date provisional', () => {
    const plan = copy(
      lastYearSource((seed) => {
        const t = seed.tasks.find((x) => x.key === 'blueskySetup')!
        delete t.milestone
        delete t.offsetDays
        // Moved by hand to four days after early bird ended (2026-05-01).
        t.dueAt = '2026-05-05T07:00:00.000Z'
      }),
    )
    expect(task(plan, 'blueskySetup')).toMatchObject({
      milestone: 'EARLY_BIRD_END',
      offsetDays: 4,
      provisional: true,
    })
  })

  it('leaves Trigger- and expansion-origin Tasks behind, and expands the countdown afresh', () => {
    const source = lastYearSource()
    const sponsor = source.campaigns.find(
      (c) => c.key === 'sponsorAcquisition',
    )!
    source.tasks.push({
      ...source.tasks.find((t) => t.key === 'prospectus:linkedin')!,
      _id: 'trigger-task',
      campaignId: sponsor._id,
      key: 'sponsorCard:sponsor-1:linkedin',
      origin: 'trigger',
    })
    const plan = copy(source)
    const keys = plan.tasks.map((t) => t.key)
    expect(keys).not.toContain('sponsorCard:sponsor-1:linkedin')
    const countdown = plan.tasks.filter((t) => t.key.startsWith('countdown:d'))
    expect(countdown).toHaveLength(30)
    expect(countdown.every((t) => t.origin === 'expansion')).toBe(true)
    expect(plan.tasks.filter((t) => t.origin === 'copy').length).toBe(
      source.tasks.filter(
        (t) => t.origin !== 'trigger' && t.origin !== 'expansion',
      ).length,
    )
  })

  it('points Prerequisites at the copies, and drops one on a Task left behind', () => {
    const source = lastYearSource()
    const render = source.tasks.find((t) => t.key === 'cfpOpenRender')!
    render.origin = 'trigger'
    const plan = copy(source)
    expect(task(plan, 'cfpOpen:linkedin').prerequisiteIds).toEqual([])
    const save = task(plan, 'saveTheDate:linkedin')
    expect(save.prerequisiteIds).toEqual([task(plan, 'saveTheDateRender')._id])
  })

  it('writes unedited copy for the new edition, with the new tagged link', () => {
    const plan = copy()
    const variant = plan.variants.find(
      (v) => v._id === task(plan, 'cfpOpen:bluesky').variantId,
    )!
    expect(variant.body).toContain('Cloud Native Bergen 2027 CFP is open')
    expect(variant.body).not.toContain('2026')
    expect(variant.link).toContain('https://2027.cloudnativebergen.dev/cfp?')
    expect(variant.body).toContain(variant.link)
    expect(task(plan, 'cfpOpenRender').alt).toContain(
      'Cloud Native Bergen 2027',
    )
  })

  it('keeps copy the organizer is recorded as having written, whatever it looks like', () => {
    // The Task says a human wrote it, even though the body still matches the
    // Template skeleton's shape: their words win.
    const source = lastYearSource()
    const edited = source.tasks.find((t) => t.key === 'cfpOpen:bluesky')!
    edited.copyEdited = true
    const plan = copy(source)
    const variant = plan.variants.find(
      (v) => v._id === task(plan, 'cfpOpen:bluesky').variantId,
    )!
    expect(variant.body).toContain('Cloud Native Bergen 2026 CFP is open')
    expect(variant.body).toContain(variant.link)
    // And the copy carries the fact, so the edition after this one keeps it.
    expect(task(plan, 'cfpOpen:bluesky').copyEdited).toBe(true)
    expect(task(plan, 'cfpLastDay:bluesky').copyEdited).toBeUndefined()
  })

  it('rewrites unedited copy even when the edition details changed since seeding', () => {
    // Seeded before the venue was known, and the venue was set afterwards.
    const source = lastYearSource()
    source.conference = { ...LAST_YEAR, venueName: 'A new venue' }
    const plan = copy(source)
    const variant = plan.variants.find(
      (v) => v._id === task(plan, 'cfpOpen:bluesky').variantId,
    )!
    expect(variant.body).toContain('Cloud Native Bergen 2027 CFP is open')
    expect(variant.body).not.toContain('A new venue')
  })

  it("keeps last year's edited copy, swapping only the tagged link", () => {
    const plan = copy(
      lastYearSource((seed) => {
        const t = seed.tasks.find((x) => x.key === 'cfpOpen:bluesky')!
        const v = seed.variants.find((x) => x._id === t.variantId)!
        v.body = `Our CFP is open and we mean it. ${v.link} #CNB`
      }),
    )
    const variant = plan.variants.find(
      (v) => v._id === task(plan, 'cfpOpen:bluesky').variantId,
    )!
    expect(variant.body).toBe(
      `Our CFP is open and we mean it. ${variant.link} #CNB`,
    )
  })

  it('dates a publishing Task that lost its variant from its Campaign start', () => {
    const plan = copy(
      lastYearSource((seed) => {
        const t = seed.tasks.find((x) => x.key === 'cfpThanks:bluesky')!
        delete t.milestone
        delete t.offsetDays
        seed.variants = seed.variants.filter((v) => v._id !== t.variantId)
      }),
    )
    const thanks = task(plan, 'cfpThanks:bluesky')
    expect(thanks).toMatchObject({ milestone: 'CFP_OPEN', offsetDays: 0 })
    const variant = plan.variants.find((v) => v._id === thanks.variantId)!
    expect(variant.body).toContain('Cloud Native Bergen 2027 CFP is closed')
  })

  it('uses unique ids across every record', () => {
    const plan = copy()
    const ids = [
      plan.plan._id,
      ...plan.campaigns.map((c) => c._id),
      ...plan.tasks.map((t) => t._id),
      ...plan.posts.map((p) => p._id),
      ...plan.variants.map((v) => v._id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('isTemplateText', () => {
  const skeleton = 'Hi {event}, see you at {venue}. Tickets (50 %): {url}'

  it('matches the skeleton however its placeholders were filled in', () => {
    expect(
      isTemplateText(
        'Hi Cloud Native Bergen 2027, see you at Grieghallen. Tickets (50 %): https://x?utm_source=bluesky',
        skeleton,
      ),
    ).toBe(true)
    // A placeholder the platform had no value for is still the Template's.
    expect(
      isTemplateText(
        'Hi {event}, see you at {venue}. Tickets (50 %): {url}',
        skeleton,
      ),
    ).toBe(true)
  })

  it('is linear, so a skeleton of many placeholders cannot hang the copy', () => {
    const many = '{a} {b} {c} {d} {e} {f}X'
    const long = 'w '.repeat(600)
    const started = Date.now()
    expect(isTemplateText(long, many)).toBe(false)
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('needs the tail to be the end, not a repeat of what already matched', () => {
    expect(isTemplateText('one two', 'one {x}')).toBe(true)
    expect(isTemplateText('end', 'start {x} end')).toBe(false)
  })

  it('does not match once the organizer has written something else', () => {
    expect(
      isTemplateText('Hi CNB 2027 — see you at Grieghallen! {url}', skeleton),
    ).toBe(false)
    expect(isTemplateText(null, skeleton)).toBe(false)
    expect(isTemplateText('anything', undefined)).toBe(false)
  })
})
