/**
 * ONE RENDER PER FORMAT — pure (docs/MARKETING_STUDIO_FORMATS_SPEC.md §4,
 * §5). A Task keeps one asset, so a render Task makes one Format, and a
 * render Recipe is materialized once per distinct Format among the posts
 * waiting on it: LinkedIn and Bluesky at their defaults get two renders, two
 * Channels wanting square share one. A post's Format is its Channel's,
 * derived here and never stored.
 *
 * Seeding, the recurring expansion and the Triggers all read Recipes through
 * {@link splitRendersByFormat}; the Recipes stored on a Campaign stay as they
 * were given.
 */

import {
  DEFAULT_STUDIO_FORMAT,
  STUDIO_FORMAT_IDS,
  studioFormatSchema,
  type StudioFormat,
} from '@/lib/marketing-asset/format'
import type { TaskRecipe } from './template/types'
import type { MarketingChannel } from './types'

/** The Format a Channel posts natively: LinkedIn landscape, else square. */
export function channelFormat(
  channel: MarketingChannel | null | undefined,
): StudioFormat {
  return channel === 'linkedin' ? 'landscape' : DEFAULT_STUDIO_FORMAT
}

/**
 * A render Task's stored Format as read back: anything that is not a Format —
 * absent on every render made before Formats — is square (spec §6).
 */
export function storedRenderFormat(value: unknown): StudioFormat {
  const parsed = studioFormatSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_STUDIO_FORMAT
}

/**
 * The key of each render made from render Recipe `key`, one per Format: the
 * first keeps the Recipe's own key (the key every render made before Formats
 * has, so a plan's existing renders and generation markers still match it),
 * and every other Format is `<key>:<format>`.
 */
function renderKeys(
  key: string,
  formats: StudioFormat[],
): Map<StudioFormat, string> {
  return new Map(formats.map((f, i) => [f, i === 0 ? key : `${key}:${f}`]))
}

/**
 * Does a post of a beat wait on this render of it? A post that lists any of
 * the beat's renders (`renderKeys`) waits on exactly the ones it lists, which
 * every post does after {@link splitRendersByFormat}; one that lists none
 * waits on every render, as `buildSubjectBeat` always made it.
 */
export function waitsOnRender(
  post: TaskRecipe,
  render: TaskRecipe,
  renderKeys: ReadonlySet<string>,
): boolean {
  if (post.kind !== 'publishing' || render.kind !== 'studioRender') return false
  const listed = (post.prerequisites ?? []).filter((key) => renderKeys.has(key))
  return listed.length === 0 || listed.includes(render.key)
}

/** The keys of the render Recipes among `recipes`. */
export function renderKeysOf(recipes: readonly TaskRecipe[]): Set<string> {
  return new Set(
    recipes.filter((r) => r.kind === 'studioRender').map((r) => r.key),
  )
}

/**
 * The stored Recipe a Task was made from: the one with its key, or, for a
 * render of another Format (`<key>:<format>`), the render Recipe it was split
 * from. Its skeletons are that render's too.
 */
export function recipeForTaskKey(
  recipes: readonly TaskRecipe[],
  taskKey: string,
): TaskRecipe | undefined {
  const own = recipes.find((r) => r.key === taskKey)
  if (own) return own
  const at = taskKey.lastIndexOf(':')
  const format = taskKey.slice(at + 1)
  if (at === -1 || !(STUDIO_FORMAT_IDS as readonly string[]).includes(format))
    return undefined
  return recipes.find(
    (r) => r.kind === 'studioRender' && r.key === taskKey.slice(0, at),
  )
}

/** Does publishing Recipe `post` wait on render Recipe `render`? */
function waitsOn(post: TaskRecipe, render: TaskRecipe): boolean {
  return (
    post.kind === 'publishing' &&
    // Listed, or in the render's beat: `buildSubjectBeat` has always made
    // every post of a beat wait on the beat's render.
    (post.prerequisites?.includes(render.key) === true ||
      post.beat === render.beat)
  )
}

/**
 * Each render Recipe without a Format becomes one render per distinct Format
 * among the posts waiting on it, in the order of `STUDIO_FORMAT_IDS`, and
 * each of those posts lists the render of its own Format. A render nothing
 * posts from is made in its own Channel's Format. A render Recipe that names
 * its Format is kept as it is, and every post in its beat lists it. Any other
 * Task listing a split render waits on every Format of it.
 */
export function splitRendersByFormat(recipes: TaskRecipe[]): TaskRecipe[] {
  const renders = recipes.filter((r) => r.kind === 'studioRender')
  if (renders.length === 0) return recipes
  /** Render key → the key of each Format it is made in. */
  const splits = new Map<string, Map<StudioFormat, string>>()
  for (const render of renders) {
    const wanted = new Set(
      recipes
        .filter((post) => waitsOn(post, render))
        .map((post) => channelFormat(post.channel)),
    )
    const formats: StudioFormat[] = render.format
      ? [render.format]
      : wanted.size > 0
        ? STUDIO_FORMAT_IDS.filter((f) => wanted.has(f))
        : [channelFormat(render.channel)]
    splits.set(render.key, renderKeys(render.key, formats))
  }
  return recipes.flatMap((recipe): TaskRecipe[] => {
    const own = splits.get(recipe.key)
    if (recipe.kind === 'studioRender' && own) {
      return [...own].map(([format, key]) => ({ ...recipe, key, format }))
    }
    if (recipe.kind !== 'publishing') {
      if (!recipe.prerequisites?.some((key) => splits.has(key))) return [recipe]
      return [
        {
          ...recipe,
          prerequisites: recipe.prerequisites.flatMap((key) => {
            const split = splits.get(key)
            return split ? [...split.values()] : [key]
          }),
        },
      ]
    }
    const format = channelFormat(recipe.channel)
    const waited = renders.filter((render) => waitsOn(recipe, render))
    if (waited.length === 0) return [recipe]
    const forPost = (render: TaskRecipe) => {
      const split = splits.get(render.key)!
      // A named Format serves every post; otherwise the post's own.
      return split.get(format) ?? [...split.values()][0]
    }
    const listed = (recipe.prerequisites ?? []).flatMap((key) => {
      const render = waited.find((r) => r.key === key)
      return render ? [forPost(render)] : [key]
    })
    const implicit = waited
      .filter((render) => !recipe.prerequisites?.includes(render.key))
      .map(forPost)
    return [{ ...recipe, prerequisites: [...listed, ...implicit] }]
  })
}
