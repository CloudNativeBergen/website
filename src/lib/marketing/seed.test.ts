/**
 * Template expansion from a fixture conference (pure). The fixture has every
 * REQUIRED date and NO optional Milestone, so every optional-Milestone anchor
 * is provisional and the fallback rule is exercised end to end.
 */
import { describe, it, expect } from 'vitest'
import {
  blankPlan,
  expandTemplate,
  type SeedConference,
  type SeedPlan,
} from './seed'
import { publishedPair } from './recipes'
import { BUILTIN_TEMPLATE, BUILTIN_TEMPLATE_VERSION } from './template'
import { placeholdersIn } from './placeholders'
import {
  getPlatformConstraints,
  validatePublishInput,
} from '@/lib/social/provider/constraints'
import { sequentialShortCodes } from './short-code'

const conference: SeedConference = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  ticketCapacity: 400,
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

function seed(overrides: Partial<Parameters<typeof expandTemplate>[0]> = {}) {
  let n = 0
  return expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference,
    includeOptional: [],
    ownerId: 'sp-owner',
    now: '2026-09-14T10:00:00.000Z',
    newShortCode: sequentialShortCodes(),
    newId: (type) => `${type}.${++n}`,
    ...overrides,
  })
}

const byKey = (plan: SeedPlan, campaign: string, task: string) => {
  const c = plan.campaigns.find((x) => x.key === campaign)!
  return plan.tasks.find((t) => t.campaignId === c._id && t.key === task)!
}

describe('blankPlan', () => {
  it('is the plan record, stamped at the given instant, and nothing else', () => {
    expect(
      blankPlan({
        conferenceId: 'conf-1',
        ownerId: 'sp-1',
        now: '2027-01-01T00:00:00Z',
      }),
    ).toEqual({
      plan: {
        _id: 'marketingPlan.conf-1',
        conferenceId: 'conf-1',
        ownerId: 'sp-1',
        templateVersion: 'blank',
        createdAt: '2027-01-01T00:00:00Z',
      },
      campaigns: [],
      tasks: [],
      posts: [],
      variants: [],
    })
  })
})

describe('expandTemplate — plan and Campaigns', () => {
  it('records the computed instant for publishing and work Tasks', () => {
    const plan = seed()
    expect(byKey(plan, 'cfp', 'cfpOpen:linkedin')).toMatchObject({
      plannedAt: '2027-01-10T07:00:00.000Z',
    })
    expect(byKey(plan, 'cfp', 'cfpOpenRender')).toMatchObject({
      plannedAt: '2027-01-08T08:00:00.000Z',
    })
  })

  it('creates one plan owned by the seeding organizer, recording the Template version', () => {
    const plan = seed()
    expect(plan.plan).toEqual({
      _id: 'marketingPlan.conf-A',
      conferenceId: 'conf-A',
      ownerId: 'sp-owner',
      templateVersion: BUILTIN_TEMPLATE_VERSION,
      createdAt: '2026-09-14T10:00:00.000Z',
    })
  })

  it('skips optional Campaigns unless asked (8 / 9 / 10)', () => {
    expect(seed().campaigns.map((c) => c.key)).not.toContain('keynotes')
    expect(seed().campaigns).toHaveLength(8)
    const nine = seed({ includeOptional: ['sponsorAcquisition'] })
    expect(nine.campaigns).toHaveLength(9)
    expect(nine.campaigns.map((c) => c.key)).toContain('sponsorAcquisition')
    expect(nine.campaigns.map((c) => c.key)).not.toContain('keynotes')
    const ten = seed({ includeOptional: ['sponsorAcquisition', 'keynotes'] })
    expect(ten.campaigns).toHaveLength(10)
    // Edition order is kept regardless of the order asked.
    expect(ten.campaigns.map((c) => c.key)).toEqual(
      BUILTIN_TEMPLATE.campaigns.map((c) => c.key),
    )
  })

  it('refuses an optional key that is not an optional Campaign', () => {
    expect(() => seed({ includeOptional: ['cfp'] })).toThrow(/cfp/)
    expect(() => seed({ includeOptional: ['nope'] })).toThrow(/nope/)
  })

  it('materializes windows from Milestone offsets and keeps the anchors', () => {
    const cfp = seed().campaigns.find((c) => c.key === 'cfp')!
    expect(cfp).toMatchObject({
      startMilestone: 'CFP_OPEN',
      startOffsetDays: 0,
      endMilestone: 'CFP_CLOSE',
      endOffsetDays: 1,
      startDate: '2027-01-10',
      endDate: '2027-03-02',
      provisional: false,
      primaryOutcome: 'cfpSubmissions',
      optional: false,
      conferenceId: 'conf-A',
    })
    const save = seed().campaigns.find((c) => c.key === 'saveTheDate')!
    expect(save.startDate).toBe('2026-12-10') // CONFERENCE_START − 26 wk
    expect(save.endDate).toBe('2027-01-21') // − 20 wk
  })

  it('flags a window provisional when an end came from a fallback', () => {
    const earlyBird = seed().campaigns.find((c) => c.key === 'earlyBird')!
    // TICKETS_OPEN falls back to CONFERENCE_START − 12 wk, EARLY_BIRD_END to
    // PROGRAM_PUBLISHED — both unset on the fixture.
    expect(earlyBird).toMatchObject({
      startDate: '2027-03-18',
      endDate: '2027-04-20',
      provisional: true,
    })
    expect(seed().campaigns.find((c) => c.key === 'cfp')!.provisional).toBe(
      false,
    )
  })

  it('proposes a Target from the ticket capacity, or none', () => {
    expect(seed().campaigns.find((c) => c.key === 'earlyBird')!.target).toBe(60)
    expect(seed().campaigns.find((c) => c.key === 'cfp')!.target).toBeNull()
    const noCapacity = seed({
      conference: { ...conference, ticketCapacity: undefined },
    })
    expect(
      noCapacity.campaigns.find((c) => c.key === 'earlyBird')!.target,
    ).toBeNull()
  })

  it('persists Triggers on the Campaign that declares them', () => {
    const speakers = seed().campaigns.find((c) => c.key === 'speakers')!
    expect(speakers.triggers).toEqual([
      { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
    ])
  })
})

describe('expandTemplate — Tasks', () => {
  it('dates each Task at its Milestone plus offset, owner as assignee', () => {
    const plan = seed()
    const task = byKey(plan, 'cfp', 'cfpReminder2w:linkedin')
    expect(task).toMatchObject({
      kind: 'publishing',
      channel: 'linkedin',
      milestone: 'CFP_CLOSE',
      offsetDays: -14,
      provisional: false,
      assigneeId: 'sp-owner',
      origin: 'template',
      campaignId: plan.campaigns.find((c) => c.key === 'cfp')!._id,
      conferenceId: 'conf-A',
      planId: 'marketingPlan.conf-A',
    })
  })

  it('creates sibling Tasks for LinkedIn and Bluesky with their own copy', () => {
    const plan = seed()
    const li = byKey(plan, 'cfp', 'cfpOpen:linkedin')
    const bs = byKey(plan, 'cfp', 'cfpOpen:bluesky')
    expect(li.channel).toBe('linkedin')
    expect(bs.channel).toBe('bluesky')
    const liVariant = plan.variants.find((v) => v._id === li.variantId)!
    const bsVariant = plan.variants.find((v) => v._id === bs.variantId)!
    expect(liVariant.body).not.toBe(bsVariant.body)
    expect(liVariant.platform).toBe('linkedin')
    expect(bsVariant.platform).toBe('bluesky')
  })

  it('resolves Prerequisites to Task ids in the same Campaign', () => {
    const plan = seed()
    const render = byKey(plan, 'cfp', 'cfpOpenRender')
    const li = byKey(plan, 'cfp', 'cfpOpen:linkedin')
    expect(render.kind).toBe('studioRender')
    expect(li.prerequisiteIds).toEqual([render._id])
    // The render is dated two days before the beat.
    expect(render.dueAt).toBe('2027-01-08T08:00:00.000Z') // 09:00 Oslo
  })

  it('creates a post plus one draft variant per publishing Task, placeholders resolved', () => {
    const plan = seed()
    const li = byKey(plan, 'cfp', 'cfpOpen:linkedin')
    expect(li.postId).toBeDefined()
    expect(li.variantId).toBeDefined()
    const post = plan.posts.find((p) => p._id === li.postId)!
    const variant = plan.variants.find((v) => v._id === li.variantId)!
    expect(variant.postId).toBe(post._id)
    expect(variant.status).toBe('draft')
    expect(post.createdBy).toBe('sp-owner')
    expect(variant.body).toContain('Cloud Native Bergen 2027')
    expect(variant.body).toContain('#CloudNativeBergen2027')
    expect(placeholdersIn(variant.body)).toEqual([])
    expect(variant.link).toBe(
      'https://cloudnativebergen.dev/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin',
    )
    // LinkedIn keeps the derived link on the variant and OUT of the body: it
    // is the first comment (§3.1, #1134). Its Bluesky sibling still carries
    // the URL in the copy, where the platform makes a card of it.
    expect(variant.body).not.toContain(variant.link)
    const bs = byKey(plan, 'cfp', 'cfpOpen:bluesky')
    const bsVariant = plan.variants.find((v) => v._id === bs.variantId)!
    expect(bsVariant.body).toContain(bsVariant.link)
    // Every publishing Task has exactly one variant, and every variant a post.
    const publishing = plan.tasks.filter((t) => t.kind === 'publishing')
    expect(plan.variants).toHaveLength(publishing.length)
    expect(plan.posts).toHaveLength(publishing.length)
    for (const t of publishing) {
      expect(t.dueAt).toBeUndefined()
      expect(t.status).toBeUndefined()
    }
  })

  it('leaves no placeholder unresolved in any seeded body', () => {
    for (const v of seed({
      includeOptional: ['sponsorAcquisition', 'keynotes'],
    }).variants) {
      expect(placeholdersIn(v.body), v._id).toEqual([])
    }
  })

  it('resolves {date}, {venue} and {city} from the conference', () => {
    const plan = seed()
    const v = plan.variants.find(
      (x) =>
        x._id === byKey(plan, 'saveTheDate', 'saveTheDate:linkedin').variantId,
    )!
    expect(v.body).toContain('Grieghallen, Bergen')
    expect(v.body).toMatch(/2027/)
    const noVenue = seed({
      conference: { ...conference, venueName: undefined },
    })
    const v2 = noVenue.variants.find(
      (x) =>
        x._id ===
        byKey(noVenue, 'saveTheDate', 'saveTheDate:linkedin').variantId,
    )!
    expect(v2.body).toContain('at a venue to be announced, Bergen')
  })

  it('schedules variants at the Channel slot in Europe/Oslo', () => {
    const plan = seed()
    const li = plan.variants.find(
      (v) => v._id === byKey(plan, 'cfp', 'cfpOpen:linkedin').variantId,
    )!
    const bs = plan.variants.find(
      (v) => v._id === byKey(plan, 'cfp', 'cfpOpen:bluesky').variantId,
    )!
    // 2027-01-10 is CET (UTC+1): 08:00 → 07:00Z, 18:00 → 17:00Z.
    expect(li.scheduledAt).toBe('2027-01-10T07:00:00.000Z')
    expect(bs.scheduledAt).toBe('2027-01-10T17:00:00.000Z')
    const post = plan.posts.find((p) => p._id === li.postId)!
    expect(post.defaultScheduledAt).toBe(li.scheduledAt)
  })

  it('resolves the alt skeleton onto the render and its publishing siblings', () => {
    const plan = seed()
    const render = byKey(plan, 'cfp', 'cfpOpenRender')
    const li = byKey(plan, 'cfp', 'cfpOpen:linkedin')
    expect(render.alt).toMatch(
      /^Call for papers open: Cloud Native Bergen 2027, .*2027, Bergen\.$/,
    )
    expect(li.alt).toBe(render.alt)
    expect(placeholdersIn(li.alt!)).toEqual([])
    expect(byKey(plan, 'cfp', 'cfpReminder2w:linkedin').alt).toBeUndefined()
  })

  it('gives non-publishing Tasks a dueAt and an open status', () => {
    const plan = seed()
    const kit = byKey(plan, 'speakers', 'speakerKit')
    expect(kit).toMatchObject({
      kind: 'checklist',
      status: 'open',
      dueAt: '2027-04-01T07:00:00.000Z', // 09:00 CEST
    })
    expect(kit.variantId).toBeUndefined()
    expect(kit.instructions).toMatch(/acceptance letter/)
    const event = byKey(plan, 'earlyBird', 'linkedinEvent')
    expect(event.kind).toBe('eventPageUpdate')
    expect(event.channel).toBe('linkedin')
  })

  it('flags Tasks anchored to an unset Milestone provisional', () => {
    const plan = seed()
    expect(byKey(plan, 'earlyBird', 'ticketsOpen:linkedin').provisional).toBe(
      true,
    )
    expect(
      byKey(plan, 'finalPush', 'registrationCloses:bluesky'),
    ).toMatchObject({
      provisional: true,
      milestone: 'REGISTRATION_CLOSE',
    })
    expect(byKey(plan, 'finalPush', 'lateBird:bluesky').provisional).toBe(false)
  })

  it('creates nothing for Trigger and subject cadence recipes (their events and subjects come later)', () => {
    const plan = seed({ includeOptional: ['sponsorAcquisition', 'keynotes'] })
    const keys = plan.tasks.map((t) => t.key)
    for (const k of [
      'speakerCard:linkedin',
      'speakerCardRender',
      'sponsorCard:bluesky',
      'talkTeaser:linkedin',
      'countdown:bluesky',
      'videoDrip:bluesky',
      'keynoteCard:linkedin',
    ]) {
      expect(keys, k).not.toContain(k)
    }
    expect(
      keys.some((k) =>
        /^(speakerCard|talkTeaser|videoDrip|keynoteCard|sponsorCard)/.test(k),
      ),
    ).toBe(false)
    // But the dated recipes of those Campaigns do seed.
    expect(keys).toContain('prospectus:linkedin')
    expect(keys).toContain('keynoteAnnounce:bluesky')
  })

  it('expands the Bluesky countdown at plan creation, one post a day from −30 d (§5.4)', () => {
    const plan = seed()
    const countdown = plan.tasks.filter((t) => t.key.startsWith('countdown:d'))
    expect(countdown).toHaveLength(30)
    expect(countdown.every((t) => t.origin === 'expansion')).toBe(true)
    expect(countdown.every((t) => t.channel === 'bluesky')).toBe(true)
    expect(byKey(plan, 'finalPush', 'countdown:d-30:bluesky')).toMatchObject({
      milestone: 'CONFERENCE_START',
      offsetDays: -30,
      provisional: false,
    })
    // The three LinkedIn countdowns stay the fixed Template recipes.
    expect(
      plan.tasks.filter(
        (t) => t.channel === 'linkedin' && t.key.startsWith('countdown'),
      ),
    ).toHaveLength(3)
  })

  it('skips countdown days already past when a plan is seeded late', () => {
    const plan = seed({ now: '2027-06-08T17:00:00.000Z' })
    expect(
      plan.tasks
        .filter((t) => t.key.startsWith('countdown:d'))
        .map((t) => t.key),
    ).toEqual(['countdown:d-1:bluesky'])
  })

  it('leaves no placeholder unresolved in a seeded body', () => {
    const plan = seed({ includeOptional: ['sponsorAcquisition', 'keynotes'] })
    for (const v of plan.variants) {
      expect(placeholdersIn(v.body), v.body).toEqual([])
    }
  })

  it('is deterministic for a given id source', () => {
    expect(seed()).toEqual(seed())
  })

  it('uses unique ids across every record', () => {
    const plan = seed({ includeOptional: ['sponsorAcquisition', 'keynotes'] })
    const ids = [
      plan.plan._id,
      ...plan.campaigns.map((c) => c._id),
      ...plan.tasks.map((t) => t._id),
      ...plan.posts.map((p) => p._id),
      ...plan.variants.map((v) => v._id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('throws when the conference lacks a required date', () => {
    expect(() =>
      seed({ conference: { ...conference, cfpEndDate: undefined } }),
    ).toThrow(/cfpEndDate/)
  })
})

describe('expandTemplate — every seeded body passes its Channel rules', () => {
  it('is accepted by the shared platform validator, so scheduling never refuses a fresh draft', () => {
    // A long but realistic title makes the copy and the tag as long as they get.
    const plan = seed({
      includeOptional: ['sponsorAcquisition', 'keynotes'],
      conference: {
        ...conference,
        title: 'Cloud Native Days Norway Trondheim 2027',
        venueName: 'Clarion Hotel & Congress Trondheim',
      },
    })
    const failures: string[] = []
    for (const v of plan.variants) {
      const constraints = getPlatformConstraints(v.platform)!
      const issues = validatePublishInput(
        constraints,
        { text: v.body, media: [], link: v.link },
        // The conference's own domain, so the first-comment rule (#1134) is
        // LIVE here: a seeded LinkedIn body that still resolved `{url}` into
        // the copy fails this test rather than passing it silently.
        { conferenceDomains: ['cloudnativebergen.dev'] },
      )
      const task = plan.tasks.find((t) => t.variantId === v._id)!
      for (const i of issues) failures.push(`${task.key}: ${i.message}`)
    }
    expect(failures).toEqual([])
  })

  it('puts our own URL in every Bluesky body and in no LinkedIn body (§3.1, #1134)', () => {
    const plan = seed({ includeOptional: ['sponsorAcquisition', 'keynotes'] })
    const carries = (body: string) =>
      body.includes('https://cloudnativebergen.dev')
    const byPlatform = { linkedin: [] as boolean[], bluesky: [] as boolean[] }
    for (const v of plan.variants) {
      if (v.platform !== 'linkedin' && v.platform !== 'bluesky') continue
      byPlatform[v.platform].push(carries(v.body))
    }
    // Guard the guard: both sides must be non-empty, or "none carry it" is
    // true of an empty list and proves nothing.
    expect(byPlatform.linkedin.length).toBeGreaterThan(20)
    expect(byPlatform.bluesky.length).toBeGreaterThan(20)
    expect(byPlatform.linkedin.filter(Boolean)).toEqual([])
    expect(byPlatform.bluesky.every(Boolean)).toBe(true)
    // The link itself is still derived and stored on the variant — it is the
    // first comment now, not absent.
    const linkedin = plan.variants.filter((v) => v.platform === 'linkedin')
    expect(linkedin.every((v) => carries(v.link ?? ''))).toBe(true)
  })
})

/** The `(utm_campaign, utm_content)` pairs of these Tasks, as published. */
const pairsOf = (plan: SeedPlan, tasks: SeedPlan['tasks']) =>
  new Set(
    tasks.map((t) =>
      publishedPair(
        plan.campaigns.find((c) => c._id === t.campaignId)!.key,
        t.key,
      ),
    ),
  )

it('does not re-offer a post this edition has already published', () => {
  // A whole-plan delete deliberately keeps published variants and posts — the
  // record of what went out must outlive a tidy-up — so seeding afterwards
  // recreated the announcement that had already gone out as a fresh draft, and
  // an organizer working the new plan could publish the CFP or ticket post a
  // second time. Trigger and expansion generation has always consulted these
  // keys; seeding did not.
  const all = seed()
  const sent = all.tasks.find((t) => t.kind === 'publishing')!
  const again = seed({ publishedKeys: pairsOf(all, [sent]) })
  expect(again.tasks.some((t) => t.key === sent.key)).toBe(false)
  // Only that one: every other Task is still seeded.
  expect(again.tasks).toHaveLength(all.tasks.length - 1)
  // And a NON-publishing Task with a colliding key is untouched — a checklist
  // is not something the edition can have "already sent".
  const tick = all.tasks.find((t) => t.kind !== 'publishing')!
  expect(
    seed({ publishedKeys: pairsOf(all, [tick]) }).tasks.some(
      (t) => t.key === tick.key,
    ),
  ).toBe(true)
})

it('drops a render once every post it feeds has gone out', () => {
  // Dropping only the posts left the beat's `studioRender` in the new plan with
  // nothing to feed: open work asking the organizer to recreate an asset no
  // remaining Task can use, and a plan-health figure inflated by it.
  const all = seed()
  const render = all.tasks.find((t) => t.kind === 'studioRender')!
  const fed = all.tasks.filter((t) => t.prerequisiteIds.includes(render._id))
  expect(fed.length).toBeGreaterThan(0)

  const none = seed({ publishedKeys: pairsOf(all, fed) })
  expect(none.tasks.some((t) => t.key === render.key)).toBe(false)

  // One still outstanding: the render is kept, because that post needs it.
  const some = seed({
    publishedKeys: pairsOf(all, fed.slice(1)),
  })
  expect(some.tasks.some((t) => t.key === render.key)).toBe(true)
})

it('does not keep a render alive on a LATER beat in the same Campaign', () => {
  // The dependant scan used to take every later publishing recipe in the
  // CAMPAIGN, so an unpublished post in an unrelated later beat preserved a
  // render nothing surviving referenced. Dependants are scoped to the render's
  // own beat now.
  const all = seed()
  const render = all.tasks.find((t) => {
    if (t.kind !== 'studioRender') return false
    const fed = all.tasks.filter((d) => d.prerequisiteIds.includes(t._id))
    return all.tasks.some(
      (other) =>
        other.campaignId === t.campaignId &&
        other.kind === 'publishing' &&
        !fed.some((d) => d._id === other._id),
    )
  })
  expect(render).toBeDefined()
  const fed = all.tasks.filter((t) => t.prerequisiteIds.includes(render!._id))
  // Only the render's OWN posts are published; other beats are untouched.
  const after = seed({ publishedKeys: pairsOf(all, fed) })
  expect(after.tasks.some((t) => t.key === render!.key)).toBe(false)
})

describe('stored Recipes (Templates spec §2.1)', () => {
  it('puts EVERY Recipe of the Template Campaign on the seeded Campaign, static ones included', () => {
    const plan = seed({ includeOptional: ['sponsorAcquisition'] })
    for (const campaign of plan.campaigns) {
      const template = BUILTIN_TEMPLATE.campaigns.find(
        (c) => c.key === campaign.key,
      )!
      expect(campaign.recipes, campaign.key).toEqual(template.recipes)
      // A copy: editing the plan's Recipes can never reach the built-in.
      const title = template.recipes[0].title
      campaign.recipes[0].title = 'Edited on the plan'
      expect(template.recipes[0].title).toBe(title)
      // Every Trigger points into the stored Recipes.
      for (const trigger of campaign.triggers) {
        expect(campaign.recipes.map((r) => r.key)).toContain(
          trigger.taskRecipeKey,
        )
      }
    }
  })

  it('records the countdown it expands on the Campaign marker, and nothing else', () => {
    const plan = seed()
    const finalPush = plan.campaigns.find((c) => c.key === 'finalPush')!
    const countdown = plan.tasks
      .filter((t) => t.campaignId === finalPush._id && t.origin === 'expansion')
      .map((t) => t.key)
    expect(countdown.length).toBeGreaterThan(0)
    expect(finalPush.generatedKeys).toEqual(countdown)
    const expansionTasks = plan.tasks.filter((t) => t.origin === 'expansion')
    expect(plan.campaigns.flatMap((c) => c.generatedKeys)).toHaveLength(
      expansionTasks.length,
    )
  })

  it('published keys are scoped by Campaign: the same Task key sent from another Campaign drops nothing', () => {
    const all = seed()
    const sent = all.tasks.find((t) => t.kind === 'publishing')!
    const again = seed({
      publishedKeys: new Set([publishedPair('custom-elsewhere', sent.key)]),
    })
    expect(again.tasks.map((t) => t.key)).toEqual(all.tasks.map((t) => t.key))
  })
})
