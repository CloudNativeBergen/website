/**
 * Recurring expansion (spec §5.4), pure: where a cadence puts its posts, how
 * subjects are dealt onto those slots, and the Tasks one subject's beat
 * becomes.
 */
import { describe, it, expect } from 'vitest'
import { resolveAllMilestones } from './milestones'
import { BUILTIN_TEMPLATE } from './template'
import type { Cadence } from './template/types'
import {
  beatRecipes,
  buildSubjectBeat,
  cadenceSlots,
  expandSubjectlessCadence,
  pickSlot,
  subjectBeatDates,
  type GenerationSubject,
} from './expansion'
import { conferenceValuesFor } from './generate'

const conference = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}
const milestones = resolveAllMilestones(conference)

const campaignRecipe = (key: string) =>
  BUILTIN_TEMPLATE.campaigns.find((c) => c.key === key)!

const cadence = (perWeek: Cadence['perWeek']): Cadence => ({
  from: { milestone: 'CFP_NOTIFY', offsetDays: 0 },
  to: { milestone: 'CFP_NOTIFY', offsetDays: 13 },
  perWeek,
})

describe('cadenceSlots', () => {
  it('spreads N posts a week evenly from the window start', () => {
    const slots = cadenceSlots(cadence({ linkedin: 2 }), 'linkedin', milestones)
    expect(slots.map((s) => s.date)).toEqual([
      '2027-04-01',
      '2027-04-04',
      '2027-04-08',
      '2027-04-11',
    ])
    expect(slots.map((s) => s.anchor.offsetDays)).toEqual([0, 3, 7, 10])
  })

  it('gives three a week on days 0, 2 and 4, and seven a week every day', () => {
    const three = cadenceSlots(cadence({ bluesky: 3 }), 'bluesky', milestones)
    expect(three.slice(0, 3).map((s) => s.anchor.offsetDays)).toEqual([0, 2, 4])
    const daily = cadenceSlots(cadence({ bluesky: 7 }), 'bluesky', milestones)
    expect(daily).toHaveLength(14)
  })

  it('places each slot at the Channel time in Oslo (LinkedIn 08:00, Bluesky 18:00)', () => {
    const [li] = cadenceSlots(cadence({ linkedin: 1 }), 'linkedin', milestones)
    const [bs] = cadenceSlots(cadence({ bluesky: 1 }), 'bluesky', milestones)
    // April is CEST (UTC+2).
    expect(li.at).toBe('2027-04-01T06:00:00.000Z')
    expect(bs.at).toBe('2027-04-01T16:00:00.000Z')
  })

  it('never passes the window end, and is empty for a Channel with no rate', () => {
    const slots = cadenceSlots(cadence({ bluesky: 7 }), 'bluesky', milestones)
    expect(slots.at(-1)!.date).toBe('2027-04-14')
    expect(
      cadenceSlots(cadence({ bluesky: 7 }), 'linkedin', milestones),
    ).toEqual([])
  })

  it('carries the provisional flag of either window end', () => {
    const video = campaignRecipe('postEvent').recipes.find(
      (r) => r.key === 'videoDrip:bluesky',
    )!
    const slots = cadenceSlots(video.cadence!, 'bluesky', milestones)
    expect(slots[0].provisional).toBe(true)
    expect(slots[0].anchor).toEqual({
      milestone: 'RECORDINGS_LIVE',
      offsetDays: 1,
    })
  })
})

describe('pickSlot', () => {
  const slots = cadenceSlots(cadence({ linkedin: 2 }), 'linkedin', milestones)

  it('takes the earliest empty slot', () => {
    const occupancy = new Map([['2027-04-01', 1]])
    expect(pickSlot(slots, occupancy, '2027-03-01T00:00:00.000Z')!.date).toBe(
      '2027-04-04',
    )
  })

  it('doubles up round-robin once every slot is taken', () => {
    const occupancy = new Map(slots.map((s) => [s.date, 1]))
    occupancy.set('2027-04-01', 2)
    expect(pickSlot(slots, occupancy, '2027-03-01T00:00:00.000Z')!.date).toBe(
      '2027-04-04',
    )
  })

  it('skips slots before the lead time, by instant not by date', () => {
    // The 04-04 LinkedIn slot is 08:00 Oslo (06:00 UTC); 09:00 Oslo the same
    // day is past it although the date is the same.
    const notBefore = '2027-04-04T07:00:00.000Z'
    expect(pickSlot(slots, new Map(), notBefore)!.date).toBe('2027-04-08')
  })

  it('returns null once the window is over', () => {
    expect(pickSlot(slots, new Map(), '2027-05-01T00:00:00.000Z')).toBeNull()
  })
})

describe('buildSubjectBeat', () => {
  const speakers = campaignRecipe('speakers')
  const recipes = beatRecipes(speakers, 'speakerCard')
  const subject: GenerationSubject = {
    _id: 'speaker-1',
    type: 'speaker',
    values: { name: 'Ada', company: 'Staff Engineer', title: 'Pods at scale' },
  }
  let n = 0
  const build = (now = '2027-03-20T12:00:00.000Z') => {
    const occupancy = { linkedin: new Map(), bluesky: new Map() }
    const dates = subjectBeatDates({ recipes, milestones, occupancy, now })
    return buildSubjectBeat({
      recipes,
      subject,
      dates: dates!,
      campaign: { _id: 'camp-speakers', key: 'speakers' },
      planId: 'plan-A',
      conference: { _id: conference._id, baseUrl: conference.baseUrl },
      values: conferenceValuesFor(conference),
      assigneeId: 'sp-owner',
      origin: 'expansion',
      taskId: (key) => `task:${key}`,
      newId: (type) => `${type}.${++n}`,
    })
  }

  it('finds the render and both siblings of a beat', () => {
    expect(recipes.map((r) => r.key)).toEqual([
      'speakerCardRender',
      'speakerCard:linkedin',
      'speakerCard:bluesky',
    ])
  })

  it('keys each Task by recipe and subject, and waits on the render', () => {
    const beat = build()
    expect(beat.tasks.map((t) => t.key)).toEqual([
      'speakerCardRender:speaker-1',
      'speakerCard:speaker-1:linkedin',
      'speakerCard:speaker-1:bluesky',
    ])
    const [render, li, bs] = beat.tasks
    expect(render._id).toBe('task:speakerCardRender:speaker-1')
    expect(li.prerequisiteIds).toEqual([render._id])
    expect(bs.prerequisiteIds).toEqual([render._id])
    expect(beat.tasks.every((t) => t.subject?._id === 'speaker-1')).toBe(true)
    expect(beat.tasks.every((t) => t.origin === 'expansion')).toBe(true)
    expect(beat.tasks.every((t) => t.assigneeId === 'sp-owner')).toBe(true)
  })

  it('dates the siblings on the cadence and the render two days before the first', () => {
    const [render, li, bs] = build().tasks
    const variants = build().variants
    expect(li).toMatchObject({ milestone: 'CFP_NOTIFY', offsetDays: 7 })
    expect(bs).toMatchObject({ milestone: 'CFP_NOTIFY', offsetDays: 7 })
    expect(variants.map((v) => v.scheduledAt)).toEqual([
      '2027-04-08T06:00:00.000Z',
      '2027-04-08T16:00:00.000Z',
    ])
    expect(render.dueAt).toBe('2027-04-06T07:00:00.000Z')
    expect(render).toMatchObject({ milestone: 'CFP_NOTIFY', offsetDays: 5 })
  })

  it('resolves subject placeholders and keeps {hook} for the organizer', () => {
    const beat = build()
    const body = beat.variants.find((v) => v.platform === 'bluesky')!.body
    expect(body).toContain(
      'Ada (Staff Engineer) is speaking at Cloud Native Bergen 2027',
    )
    expect(body).toContain('"Pods at scale" — {hook}')
    expect(body).toContain('utm_content=speakerCard%3Aspeaker-1%3Abluesky')
    expect(beat.tasks[0].alt).toContain('Speaker card: Ada, Staff Engineer.')
  })

  it('never dates the render in the past when the first slot is close', () => {
    // First eligible slot 04-08 needs 24 h lead: now 04-06 20:00 UTC.
    const [render] = build('2027-04-06T20:00:00.000Z').tasks
    expect(render.dueAt).toBe('2027-04-06T20:00:00.000Z')
    expect(render.milestone).toBeUndefined()
  })

  it('is nothing once the cadence window is over', () => {
    const occupancy = { linkedin: new Map(), bluesky: new Map() }
    expect(
      subjectBeatDates({
        recipes,
        milestones,
        occupancy,
        now: '2027-06-10T00:00:00.000Z',
      }),
    ).toBeNull()
  })
})

describe('expandSubjectlessCadence (countdown)', () => {
  const finalPush = campaignRecipe('finalPush')
  const recipes = beatRecipes(finalPush, 'countdown')
  let n = 0
  const expand = (now: string) =>
    expandSubjectlessCadence({
      recipes,
      milestones,
      now,
      campaign: { _id: 'camp-final', key: 'finalPush' },
      planId: 'plan-A',
      conference: { _id: conference._id, baseUrl: conference.baseUrl },
      values: conferenceValuesFor(conference),
      assigneeId: 'sp-owner',
      taskId: (key) => `task:${key}`,
      newId: (type) => `${type}.${++n}`,
    })

  it('creates one Bluesky post a day from −30 d to −1 d, counting down', () => {
    const records = expand('2027-01-01T00:00:00.000Z')
    expect(records.tasks).toHaveLength(30)
    expect(records.tasks[0].key).toBe('countdown:d-30:bluesky')
    expect(records.tasks.at(-1)!.key).toBe('countdown:d-1:bluesky')
    expect(records.variants[0].body).toMatch(
      /^⏳ 30 days to Cloud Native Bergen 2027/,
    )
    expect(records.variants.at(-1)!.body).toMatch(/^⏳ 1 day to /)
    expect(records.tasks[0]).toMatchObject({
      milestone: 'CONFERENCE_START',
      offsetDays: -30,
    })
    expect(records.tasks.every((t) => t.origin === 'expansion')).toBe(true)
  })

  it('skips days whose slot has already passed', () => {
    // 2027-06-08 18:00 Oslo = 16:00 UTC is −2 d; at 17:00 UTC only −1 d is left.
    const records = expand('2027-06-08T17:00:00.000Z')
    expect(records.tasks.map((t) => t.key)).toEqual(['countdown:d-1:bluesky'])
  })
})
