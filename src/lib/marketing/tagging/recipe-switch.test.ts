// @vitest-environment node
/**
 * The recipe form's "Tag the subject" switch, end to end (#1156, tagging
 * spec §2): an edit that ONLY flips it is saved on the Campaign, is saved into
 * a Template Version, and a plan seeded from that version generates Bluesky
 * copy that tags. Every Sanity hop runs the REAL write and GROQ projection
 * (groq-js), because a field one of them drops reads back as `undefined` — off
 * — and nothing would error. Asserted on the VALUE at each hop.
 */
import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.docs, params })).get(),
  },
  clientWrite: {
    transaction: () => {
      const created: Record<string, unknown>[] = []
      const tx = {
        create: (doc: Record<string, unknown>) => {
          created.push(JSON.parse(JSON.stringify(doc)))
          return tx
        },
        commit: async () => {
          h.docs.push(...created)
          return {}
        },
      }
      return tx
    },
  },
}))

import { RecipeEditsSchema } from '@/server/schemas/marketing'
import { applyEdits, editsOf, libraryEntry, newRecipeEdits } from '../library'
import { buildTemplate, type SaveSource } from '../plan-templates'
import {
  createTemplateVersion,
  getTemplateVersion,
} from '../plan-templates/sanity'
import {
  RECIPE_PROJECTION,
  recipeToStored,
  recipesFromStored,
} from '../recipes'
import { expandTemplate } from '../seed'
import { beatRecipes, buildSubjectBeat, type BeatDates } from '../expansion'
import type { TaskRecipe } from '../template/types'

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const T1 = '11111111-1111-4111-8111-111111111111'
const entry = libraryEntry('speakerCard')
const CONFERENCE = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}

/** A Campaign's Recipes as written, projected and read back from Sanity. */
async function throughCampaign(recipes: TaskRecipe[]) {
  const dataset = [
    {
      _id: 'camp-1',
      _type: 'marketingCampaign',
      recipes: JSON.parse(JSON.stringify(recipes.map(recipeToStored))),
    },
  ]
  const row = (await (
    await evaluate(parse(`*[_id == "camp-1"][0]{ ${RECIPE_PROJECTION} }`), {
      dataset,
    })
  ).get()) as { recipes: Parameters<typeof recipesFromStored>[0] }
  return recipesFromStored(row.recipes)
}

/** Save the plan as version 1 of a Template, and read that version back. */
async function throughTemplate(recipes: TaskRecipe[]) {
  h.docs = []
  const source: SaveSource = {
    plan: { _id: 'marketingPlan.conf-A' },
    conference: CONFERENCE,
    ticketCapacity: 400,
    campaigns: [
      {
        _id: 'camp-1',
        key: 'custom-speakers',
        title: 'Our speakers',
        startMilestone: 'CFP_NOTIFY',
        startOffsetDays: 0,
        endMilestone: 'CONFERENCE_START',
        endOffsetDays: 0,
        primaryOutcome: 'attributedSessions',
        outcomeTargetPage: '/program',
        target: null,
        triggers: entry.triggers,
        recipes,
        optional: false,
      },
    ],
    tasks: [],
  }
  const saved = await createTemplateVersion({
    orgId: 'org-A',
    templateId: T1,
    name: 'Our playbook',
    version: 1,
    campaigns: buildTemplate(source, {}),
    savedFrom: 'conf-A',
    savedBy: 'sp-1',
    savedAt: '2027-01-10T10:00:00.000Z',
  })
  expect(saved).toBe(true)
  const version = (await getTemplateVersion('org-A', T1, 1))!
  // Seeding from it is the ordinary expansion (§6.1); the plan is frozen at
  // the Recipes it was given.
  const plan = expandTemplate({
    template: {
      name: version.name,
      version: '1',
      campaigns: version.campaigns,
    },
    conference: {
      ...CONFERENCE,
      baseUrl: 'https://cloudnativebergen.dev',
      shortLinkOrigin: 'https://cloudnativebergen.dev',
    },
    includeOptional: [],
    ownerId: 'sp-1',
    now: '2027-01-11T10:00:00.000Z',
    newId: (type) => `${type}.new`,
    newShortCode: () => 'code1',
  })
  return plan.campaigns[0].recipes
}

/** The Bluesky body the seeded plan generates for a speaker with a handle. */
function blueskyBody(recipes: TaskRecipe[]) {
  const rs = beatRecipes({ recipes }, 'speakerCard')
  const dates: BeatDates = new Map(
    rs.map((r) => [
      r.key,
      { at: '2027-04-08T16:00:00.000Z', anchor: null, provisional: false },
    ]),
  )
  let n = 0
  const beat = buildSubjectBeat({
    recipes: rs,
    subject: {
      _id: 'spk-alice',
      type: 'speaker',
      values: { name: 'Alice Liddell', company: 'SRE', title: 'Pods' },
      people: [{ _id: 'spk-alice', name: 'Alice Liddell' }],
    },
    tags: new Map([
      ['spk-alice', { status: 'tagged', handle: 'alice.dev', did: DID }],
    ]),
    dates,
    campaign: { _id: 'camp', key: 'custom-speakers' },
    planId: 'plan',
    conference: {
      _id: 'conf-A',
      baseUrl: 'https://example.dev',
      shortLinkOrigin: 'https://example.dev',
    },
    values: { event: 'CNB 2027' },
    assigneeId: 'owner',
    origin: 'trigger',
    taskId: (key) => `task:${key}`,
    newShortCode: () => `code${++n}`,
    newId: (type) => `${type}.${++n}`,
  })
  return beat.variants.find((v) => v.platform === 'bluesky')!.body
}

describe('the "Tag the subject" switch, from the form to generated copy', () => {
  it('an edit that only switches it ON is saved, survives a Template Version, and tags', async () => {
    // Attached as a new Recipe: off.
    const attached = await throughCampaign(
      applyEdits(entry, newRecipeEdits(entry)),
    )
    const before = editsOf(entry, attached)
    expect(before.tagSubject).not.toBe(true)
    expect(blueskyBody(attached)).toContain('Alice Liddell')

    // The organizer flips the switch and changes nothing else.
    const flipped = RecipeEditsSchema.parse({ ...before, tagSubject: true })
    expect(flipped.tagSubject).toBe(true)
    const stored = await throughCampaign(applyEdits(entry, flipped))
    expect(editsOf(entry, stored).tagSubject).toBe(true)

    const seeded = await throughTemplate(stored)
    expect(
      seeded.find((r) => r.key === 'speakerCard:bluesky')!.tagSubject,
    ).toBe(true)
    expect(editsOf(entry, seeded).tagSubject).toBe(true)
    const body = blueskyBody(seeded)
    expect(body).toContain('@alice.dev')
    expect(body).not.toContain('Alice Liddell')
  })
  it('an edit that only switches it OFF survives too: the seeded plan names, never tags', async () => {
    const on = await throughCampaign(
      applyEdits(entry, { ...newRecipeEdits(entry), tagSubject: true }),
    )
    const flipped = RecipeEditsSchema.parse({
      ...editsOf(entry, on),
      tagSubject: false,
    })
    const seeded = await throughTemplate(
      await throughCampaign(applyEdits(entry, flipped)),
    )
    expect(
      seeded.find((r) => r.key === 'speakerCard:bluesky')!.tagSubject,
    ).not.toBe(true)
    const body = blueskyBody(seeded)
    expect(body).toContain('Alice Liddell')
    expect(body).not.toContain('@alice.dev')
  })
})
