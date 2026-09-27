import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATE,
  BUILTIN_TEMPLATE_VERSION,
} from '../../src/lib/marketing/template'
import { REWRITES } from './rewrites'
import { TEMPLATE_2026_1 } from '../053-store-campaign-recipes/template-2026.1'
import migration from './index'

type Doc = Record<string, unknown>
interface Patch {
  id: string
  options?: { ifRevision?: string }
  patches: {
    path: (string | { _key: string })[]
    op: { type: string; value: unknown }
  }[]
}

// The 2026.2 texts, written out here as the independent source of truth.
const OLD = {
  teaserLinkedin:
    '{hook}\n\n{name} ({company}) answers it at {event}.\n\n🎙️ "{title}"\n\nSchedule — link in the first comment.\n\n{eventTag}',
  teaserBluesky:
    '{hook}\n\n{name} has the answer — and the graphs. "{title}" at {event}.\n\n{url}',
  videoLinkedin:
    '{hook}\n\n{name} ({company}) at {event}: "{title}". Recording online.\n\nWatch — link in the first comment.\n\n{eventTag}',
  videoBluesky:
    '🎬 "{title}" — {name} ({company}) at {event}.\n\n{hook}\n\n{url}',
}
const NEW = {
  teaserLinkedin:
    '{hook}\n\nAnswered at {event} by {speakers}.\n\n🎙️ "{title}"\n\nSchedule — link in the first comment.\n\n{eventTag}',
  teaserBluesky:
    '{hook}\n\nThe answer — and the graphs: "{title}" by {name} at {event}.\n\n{url}',
  videoLinkedin:
    '{hook}\n\n{speakers} at {event}: "{title}". Recording online.\n\nWatch — link in the first comment.\n\n{eventTag}',
  videoBluesky: '🎬 "{title}" — {speakers} at {event}.\n\n{hook}\n\n{url}',
}

const recipe = (key: string, skeleton: string, over: Doc = {}): Doc => ({
  _key: key.replace(':', '_'),
  _type: 'marketingRecipe',
  key,
  kind: 'publishing',
  subjectSource: 'talk',
  skeleton,
  ...over,
})
const campaign = (id: string, recipes: Doc[], over: Doc = {}): Doc => ({
  _id: id,
  _rev: `rev-${id}`,
  _type: 'marketingCampaign',
  key: 'programme',
  recipes,
  ...over,
})

async function run(docs: Doc[]) {
  const documents = async function* () {
    for (const document of docs) yield document
  }
  const out: Patch[] = []
  const migrate = migration.migrate as unknown as (
    d: () => AsyncGenerator<Doc>,
  ) => AsyncGenerator<Patch | Patch[]>
  for await (const mutation of migrate(documents))
    out.push(...(Array.isArray(mutation) ? mutation : [mutation]))
  return out
}

/** Apply the patches the way Sanity would: set a recipe's field by `_key`. */
function apply(docs: Doc[], patches: Patch[]): Doc[] {
  return docs.map((d) => {
    const mine = patches.filter((p) => p.id === d._id)
    if (mine.length === 0) return d
    const recipes = (d.recipes as Doc[]).map((r) => ({ ...r }))
    for (const p of mine)
      for (const { path, op } of p.patches) {
        const [, sel, field] = path as [string, { _key: string }, string]
        recipes.find((r) => r._key === sel._key)![field] = op.value
      }
    return { ...d, recipes, _rev: `${d._rev}+` }
  })
}

const skeletons = (d: Doc) =>
  (d.recipes as Doc[]).map((r) => [r.key, r.skeleton])

describe('migration 054', () => {
  const unedited = campaign('camp-1', [
    recipe('talkTeaser:linkedin', OLD.teaserLinkedin),
    recipe('talkTeaser:bluesky', OLD.teaserBluesky),
    recipe('videoDrip:linkedin', OLD.videoLinkedin),
    recipe('videoDrip:bluesky', OLD.videoBluesky),
    recipe('speakerCard:bluesky', '🎙️ {name} ({company}) is speaking', {
      subjectSource: 'speaker',
    }),
  ])

  it('rewrites every UNEDITED built-in talk skeleton to the 2026.3 text, compare-and-set', async () => {
    const out = await run([unedited])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('camp-1')
    expect(out[0].options).toEqual({ ifRevision: 'rev-camp-1' })
    expect(skeletons(apply([unedited], out)[0])).toEqual([
      ['talkTeaser:linkedin', NEW.teaserLinkedin],
      ['talkTeaser:bluesky', NEW.teaserBluesky],
      ['videoDrip:linkedin', NEW.videoLinkedin],
      ['videoDrip:bluesky', NEW.videoBluesky],
      // A speaker subject is one person: its copy is not touched.
      ['speakerCard:bluesky', '🎙️ {name} ({company}) is speaking'],
    ])
  })

  it('leaves an EDITED skeleton alone, even one that still says {name} ({company})', async () => {
    const edited = campaign('camp-2', [
      recipe('videoDrip:bluesky', `${OLD.videoBluesky} 🎉`),
      recipe(
        'talkTeaser:linkedin',
        OLD.teaserLinkedin.replace('{hook}', 'Why?'),
      ),
      recipe('videoDrip:linkedin', OLD.videoLinkedin),
    ])
    const out = await run([edited])
    expect(skeletons(apply([edited], out)[0])).toEqual([
      ['videoDrip:bluesky', `${OLD.videoBluesky} 🎉`],
      ['talkTeaser:linkedin', OLD.teaserLinkedin.replace('{hook}', 'Why?')],
      ['videoDrip:linkedin', NEW.videoLinkedin],
    ])
  })

  it('never moves text between beats: an old text under another recipe or subject is left', async () => {
    const odd = campaign('camp-3', [
      // The video text on a teaser Recipe, and on a speaker-subject Recipe.
      recipe('talkTeaser:bluesky', OLD.videoBluesky),
      recipe('custom:bluesky', OLD.videoBluesky, { subjectSource: 'speaker' }),
      // The right key on a Recipe that is not about a talk any more.
      recipe('videoDrip:bluesky', OLD.videoBluesky, {
        _key: 'vd-speaker',
        subjectSource: 'speaker',
      }),
    ])
    expect(await run([odd])).toEqual([])
  })

  it('a re-run is a no-op, and a Campaign with nothing to rewrite is skipped', async () => {
    const once = apply([unedited], await run([unedited]))
    expect(await run(once)).toEqual([])
    expect(
      await run([
        campaign('camp-empty', []),
        { _id: 'camp-none', _rev: 'r', _type: 'marketingCampaign' },
      ]),
    ).toEqual([])
  })

  it('rewrites a draft and a Content Release copy too, each compare-and-set on its own revision', async () => {
    // Publishing either later replaces the live Campaign: left on the old
    // text, it would bring back "Alice and Bob (Alice's title)".
    const draft = { ...unedited, _id: 'drafts.camp-1', _rev: 'rev-draft' }
    const version = {
      ...unedited,
      _id: 'versions.r1.camp-1',
      _rev: 'rev-version',
    }
    const out = await run([draft, version])
    expect(out.map((p) => [p.id, p.options])).toEqual([
      ['drafts.camp-1', { ifRevision: 'rev-draft' }],
      ['versions.r1.camp-1', { ifRevision: 'rev-version' }],
    ])
    for (const d of apply([draft, version], out))
      expect(skeletons(d).slice(0, 4)).toEqual([
        ['talkTeaser:linkedin', NEW.teaserLinkedin],
        ['talkTeaser:bluesky', NEW.teaserBluesky],
        ['videoDrip:linkedin', NEW.videoLinkedin],
        ['videoDrip:bluesky', NEW.videoBluesky],
      ])
  })

  it('rewrites the 2026.1 LinkedIn texts (a plan backfilled by 053) and keeps their link wording', async () => {
    // Frozen by 053 (`template-2026.1.ts`): the link still in the body.
    const v1 = campaign('camp-2026-1', [
      recipe(
        'talkTeaser:linkedin',
        '{hook}\n\n{name} ({company}) answers it at {event}.\n\n🎙️ "{title}"\n\nSchedule → {url}\n\n{eventTag}',
      ),
      recipe(
        'videoDrip:linkedin',
        '{hook}\n\n{name} ({company}) at {event}: "{title}". Recording online.\n\nWatch → {url}\n\n{eventTag}',
      ),
    ])
    expect(skeletons(apply([v1], await run([v1]))[0])).toEqual([
      [
        'talkTeaser:linkedin',
        '{hook}\n\nAnswered at {event} by {speakers}.\n\n🎙️ "{title}"\n\nSchedule → {url}\n\n{eventTag}',
      ],
      [
        'videoDrip:linkedin',
        '{hook}\n\n{speakers} at {event}: "{title}". Recording online.\n\nWatch → {url}\n\n{eventTag}',
      ],
    ])
  })

  it('matches every 2026.1 talk skeleton 053 froze that names {name} ({company}) or "{name} has"', () => {
    const froms = new Set(REWRITES.map((r) => `${r.recipeKey}|${r.from}`))
    const legacy = TEMPLATE_2026_1.campaigns
      .flatMap((c) => c.recipes)
      .filter(
        (r) =>
          r.subjectSource === 'talk' &&
          /\{name\} \(\{company\}\)|\{name\} has/.test(r.skeleton ?? ''),
      )
    expect(legacy.map((r) => r.key).sort()).toEqual([
      'talkTeaser:bluesky',
      'talkTeaser:linkedin',
      'videoDrip:bluesky',
      'videoDrip:linkedin',
    ])
    for (const r of legacy)
      expect(froms.has(`${r.key}|${r.skeleton}`), r.key).toBe(true)
  })

  it('writes exactly what the live built-in says while it is 2026.3', () => {
    expect(BUILTIN_TEMPLATE_VERSION).toBe('2026.3')
    const live = new Map(
      BUILTIN_TEMPLATE.campaigns
        .flatMap((c) => c.recipes)
        .map((r) => [r.key, r.skeleton]),
    )
    // The 2026.1 LinkedIn pairs keep their in-body link, so they are not
    // the live text; their exact output is pinned in the test above.
    const current = REWRITES.filter((r) => !r.to.includes('→ {url}'))
    for (const r of current)
      expect(live.get(r.recipeKey), r.recipeKey).toBe(r.to)
    expect(current.map((r) => [r.recipeKey, r.from])).toEqual([
      ['talkTeaser:linkedin', OLD.teaserLinkedin],
      ['talkTeaser:bluesky', OLD.teaserBluesky],
      ['videoDrip:linkedin', OLD.videoLinkedin],
      ['videoDrip:bluesky', OLD.videoBluesky],
    ])
    expect(REWRITES).toHaveLength(6)
  })
})
