/**
 * @vitest-environment node
 *
 * The stored form of a Task Recipe: what is written to
 * `marketingCampaign.recipes[]` reads back as the Recipe it was.
 */

import { describe, expect, it } from 'vitest'
import { generatedTaskKey } from './materialize'
import {
  isSubjectlessKey,
  publishedPair,
  RECIPE_PROJECTION,
  recipeFromStored,
  recipeToStored,
} from './recipes'
import { BUILTIN_TEMPLATE } from './template'

const all = BUILTIN_TEMPLATE.campaigns.flatMap((c) => c.recipes)

describe('stored Recipes', () => {
  it('round-trips every built-in Recipe, through JSON as Sanity would', () => {
    for (const recipe of all) {
      const stored = JSON.parse(JSON.stringify(recipeToStored(recipe)))
      // An empty Prerequisite list and an absent one are the same Recipe.
      const { prerequisites, ...rest } = recipe
      expect(recipeFromStored(stored)).toEqual(
        prerequisites?.length ? recipe : rest,
      )
    }
  })

  it('exactly the five built-in Bluesky Recipes about a person or a company tag their subject (tagging spec §2, #1152)', () => {
    expect(
      all
        .filter((r) => r.tagSubject !== undefined)
        .map((r) => [r.key, r.tagSubject]),
    ).toEqual([
      ['sponsorCard:bluesky', true],
      ['keynoteCard:bluesky', true],
      ['speakerCard:bluesky', true],
      ['talkTeaser:bluesky', true],
      ['videoDrip:bluesky', true],
    ])
  })

  it('gives every Recipe of a Campaign a unique _key', () => {
    for (const campaign of BUILTIN_TEMPLATE.campaigns) {
      const keys = campaign.recipes.map((r) => recipeToStored(r)._key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('the _key escaping is injective: keys that differ only in punctuation stay apart', () => {
    const keyOf = (key: string) => recipeToStored({ ...all[0], key })._key
    // 'a:b' vs 'a\u03ab' and 'x\n1' vs 'x\u00a1' collide under variable-width hex.
    const keys = [
      'a:b',
      'a-b',
      'a_b',
      'a_003ab',
      'a b',
      'a\u03ab',
      'x\n1',
      'x\u00a1',
    ].map(keyOf)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((k) => /^[a-zA-Z0-9_-]+$/.test(k))).toBe(true)
  })

  it('reads the nulls a GROQ projection returns as absent fields', () => {
    const recipe = recipeFromStored({
      key: 'cfpOpen:linkedin',
      beat: 'cfpOpen',
      title: 'CFP open',
      kind: 'publishing',
      channel: 'linkedin',
      subjectSource: 'none',
      anchor: null,
      prerequisites: null,
      targetPage: null,
      skeleton: null,
      alt: null,
      instructions: null,
      cadence: null,
    })
    expect(recipe).toEqual({
      key: 'cfpOpen:linkedin',
      beat: 'cfpOpen',
      title: 'CFP open',
      kind: 'publishing',
      channel: 'linkedin',
      subjectSource: 'none',
    })
  })

  it('keeps the Format of a render Recipe through the store, and reads anything else as none (Formats spec §6)', () => {
    const render = {
      key: 'cardRender',
      beat: 'card',
      title: 'Render: Card',
      kind: 'studioRender' as const,
      subjectSource: 'none' as const,
    }
    const stored = JSON.parse(
      JSON.stringify(recipeToStored({ ...render, format: 'portrait' })),
    )
    expect(stored.format).toBe('portrait')
    expect(recipeFromStored(stored)).toEqual({ ...render, format: 'portrait' })
    // A Recipe stored before Formats, or with a value no Format has.
    expect(recipeFromStored({ ...render, format: null })).toEqual(render)
    expect(recipeFromStored({ ...render, format: 'banner' as never })).toEqual(
      render,
    )
  })

  it('names the Format in the projection every Recipe is read with', () => {
    expect(RECIPE_PROJECTION).toMatch(/\bformat\b/)
  })

  it('drops a Recipe it cannot identify rather than guessing', () => {
    expect(recipeFromStored({ key: 'x', beat: null })).toBeNull()
    expect(recipeFromStored(null)).toBeNull()
  })
})

describe('isSubjectlessKey', () => {
  const countdown = all.filter((r) => r.cadence && r.subjectSource === 'none')

  it('recognises the keys the subjectless expansion generates', () => {
    expect(countdown.length).toBeGreaterThan(0)
    for (const r of countdown) {
      expect(isSubjectlessKey(all, generatedTaskKey(r.key, 'd-30'))).toBe(true)
      expect(isSubjectlessKey(all, generatedTaskKey(r.key, 'd0'))).toBe(true)
    }
  })

  it('does not claim a static Task, a subject Task or the bare Recipe key', () => {
    expect(isSubjectlessKey(all, countdown[0].key)).toBe(false)
    expect(isSubjectlessKey(all, 'cfpOpen:linkedin')).toBe(false)
    expect(
      isSubjectlessKey(all, generatedTaskKey(countdown[0].key, 'speaker-1')),
    ).toBe(false)
    expect(isSubjectlessKey(all, 'speakerCard:d-3:linkedin')).toBe(false)
  })
})

describe('publishedPair', () => {
  it('keeps the same Task key on two Campaigns apart', () => {
    expect(publishedPair('cfp', 'countdown:d-3:bluesky')).not.toBe(
      publishedPair('custom-1', 'countdown:d-3:bluesky'),
    )
  })
})
