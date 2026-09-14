/**
 * The built-in Template is data; these tests are its type-checker for the
 * things TypeScript cannot see: key uniqueness, Prerequisite references,
 * sibling pairs, placeholder vocabulary, and the optional set seeding asks
 * about.
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_TEMPLATE, optionalCampaigns } from './builtin'
import { MILESTONES } from '../milestones'
import { PAGE_OUTCOMES } from '../types'
import {
  CONFERENCE_PLACEHOLDERS,
  PLACEHOLDERS,
  SUBJECT_PLACEHOLDERS,
  placeholdersIn,
} from '../placeholders'

const campaigns = BUILTIN_TEMPLATE.campaigns
const recipes = campaigns.flatMap((c) =>
  c.recipes.map((r) => ({ campaign: c.key, ...r })),
)

describe('built-in Template', () => {
  it('is versioned', () => {
    expect(BUILTIN_TEMPLATE.version).toMatch(/^\d{4}\.\d+$/)
  })

  it('has the ten Campaigns of spec §5.1 in edition order', () => {
    expect(campaigns.map((c) => c.key)).toEqual([
      'saveTheDate',
      'sponsorAcquisition',
      'cfp',
      'earlyBird',
      'keynotes',
      'speakers',
      'programme',
      'finalPush',
      'eventWeek',
      'postEvent',
    ])
  })

  it('marks exactly Sponsor acquisition and Keynotes optional', () => {
    expect(optionalCampaigns().map((c) => c.key)).toEqual([
      'sponsorAcquisition',
      'keynotes',
    ])
  })

  it('anchors every window and recipe to a known Milestone', () => {
    for (const c of campaigns) {
      expect(MILESTONES).toContain(c.start.milestone)
      expect(MILESTONES).toContain(c.end.milestone)
    }
    for (const r of recipes) {
      if (r.anchor) expect(MILESTONES).toContain(r.anchor.milestone)
      if (r.cadence) {
        expect(MILESTONES).toContain(r.cadence.from.milestone)
        expect(MILESTONES).toContain(r.cadence.to.milestone)
      }
    }
  })

  it('names a target page for page-counting Outcomes', () => {
    for (const c of campaigns) {
      if (PAGE_OUTCOMES.includes(c.primaryOutcome)) {
        expect(c.outcomeTargetPage, c.key).toMatch(/^\//)
      }
    }
  })

  it('uses recipe keys that are unique within a Campaign', () => {
    for (const c of campaigns) {
      const keys = c.recipes.map((r) => r.key)
      expect(new Set(keys).size, c.key).toBe(keys.length)
    }
  })

  it('points every Prerequisite at a recipe in the same Campaign', () => {
    for (const c of campaigns) {
      const keys = new Set(c.recipes.map((r) => r.key))
      for (const r of c.recipes) {
        for (const p of r.prerequisites ?? []) {
          expect(keys.has(p), `${c.key}/${r.key} → ${p}`).toBe(true)
          expect(p).not.toBe(r.key)
        }
      }
    }
  })

  it('points every Trigger at a recipe in its Campaign', () => {
    for (const c of campaigns) {
      const keys = new Set(c.recipes.map((r) => r.key))
      for (const t of c.triggers) {
        expect(keys.has(t.taskRecipeKey), `${c.key} → ${t.taskRecipeKey}`).toBe(
          true,
        )
      }
    }
  })

  it('gives every publishing recipe a Channel, a target page, a skeleton and a channel-suffixed key', () => {
    for (const r of recipes) {
      if (r.kind !== 'publishing') continue
      expect(r.channel, r.key).toBeDefined()
      expect(r.key).toBe(`${r.beat}:${r.channel}`)
      expect(r.targetPage, r.key).toMatch(/^\//)
      expect(r.skeleton, r.key).toBeTruthy()
    }
  })

  it('never cross-posts: siblings of one beat are on different Channels', () => {
    const byBeat = new Map<string, string[]>()
    for (const r of recipes) {
      if (r.kind !== 'publishing') continue
      const list = byBeat.get(`${r.campaign}/${r.beat}`) ?? []
      list.push(r.channel!)
      byBeat.set(`${r.campaign}/${r.beat}`, list)
    }
    for (const [beat, channels] of byBeat) {
      expect(new Set(channels).size, beat).toBe(channels.length)
    }
    // And the common case really is a pair.
    const pairs = [...byBeat.values()].filter((c) => c.length === 2)
    expect(pairs.length).toBeGreaterThan(15)
  })

  it('precedes every image beat with a studioRender Prerequisite', () => {
    for (const r of recipes) {
      if (r.kind !== 'publishing' || !r.alt) continue
      const render = r.prerequisites?.find((p) => p.endsWith('Render'))
      expect(render, r.key).toBeDefined()
      const renderRecipe = recipes.find(
        (x) => x.campaign === r.campaign && x.key === render,
      )
      expect(renderRecipe?.kind).toBe('studioRender')
    }
  })

  it('only uses known placeholders', () => {
    for (const r of recipes) {
      for (const text of [r.skeleton, r.alt, r.instructions]) {
        if (!text) continue
        for (const p of placeholdersIn(text)) {
          expect(PLACEHOLDERS, `${r.key}: {${p}}`).toContain(p)
        }
      }
    }
  })

  it('uses subject placeholders only in recipes with a subject', () => {
    for (const r of recipes) {
      if (r.subjectSource !== 'none') continue
      for (const text of [r.skeleton, r.alt]) {
        if (!text) continue
        for (const p of placeholdersIn(text)) {
          expect(SUBJECT_PLACEHOLDERS, `${r.key}: {${p}}`).not.toContain(p)
        }
      }
    }
  })

  it('carries the tagged link in every publishing skeleton', () => {
    for (const r of recipes) {
      if (r.kind !== 'publishing') continue
      expect(placeholdersIn(r.skeleton!), r.key).toContain('url')
    }
  })

  it('declares Triggers and cadences without dating them', () => {
    // A Trigger-created recipe has no anchor: the event dates it.
    const triggered = new Set(
      campaigns.flatMap((c) => c.triggers.map((t) => t.taskRecipeKey)),
    )
    for (const r of recipes) {
      if (triggered.has(r.key)) expect(r.anchor, r.key).toBeUndefined()
      if (r.cadence) expect(r.anchor, r.key).toBeUndefined()
    }
    // The four recurring beats of spec §5.4 plus the keynote card.
    const cadenced = new Set(
      recipes.filter((r) => r.cadence).map((r) => r.beat),
    )
    expect([...cadenced].sort()).toEqual(
      [
        'countdown',
        'keynoteCard',
        'speakerCard',
        'talkTeaser',
        'videoDrip',
      ].sort(),
    )
  })

  it('has a conference placeholder vocabulary that matches the spec', () => {
    expect(
      [...CONFERENCE_PLACEHOLDERS, ...SUBJECT_PLACEHOLDERS].sort(),
    ).toEqual(
      [
        'event',
        'date',
        'venue',
        'city',
        'name',
        'company',
        'title',
        'hook',
        'tier',
        'url',
        'eventTag',
      ].sort(),
    )
  })
})
