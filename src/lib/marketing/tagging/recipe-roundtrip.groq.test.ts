// @vitest-environment node
/**
 * `tagSubject` on a Campaign's stored Recipe, written by `recipeToStored` and
 * read back through the REAL `RECIPE_PROJECTION` (groq-js), asserted on the
 * VALUE (tagging spec §2). A field dropped from the projection is `undefined`,
 * not an error — the plain `recipeToStored → recipeFromStored` round trip
 * would never notice.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import {
  RECIPE_PROJECTION,
  recipeToStored,
  recipesFromStored,
} from '../recipes'
import { BUILTIN_TEMPLATE } from '../template'

const speakers = BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'speakers')!

async function throughSanity(recipes: typeof speakers.recipes) {
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

describe('tagSubject on a stored Recipe', () => {
  it('survives the write, the projection and the read', async () => {
    const read = await throughSanity(
      speakers.recipes.map((r) =>
        r.key === 'speakerCard:bluesky' ? { ...r, tagSubject: true } : r,
      ),
    )
    expect(read.find((r) => r.key === 'speakerCard:bluesky')!.tagSubject).toBe(
      true,
    )
    // Off stays absent — the same Recipe it was written as.
    expect(
      read.find((r) => r.key === 'speakerCard:linkedin'),
    ).not.toHaveProperty('tagSubject')
  })
})
