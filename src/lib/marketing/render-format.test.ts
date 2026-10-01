/**
 * @vitest-environment node
 *
 * One render per Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md §4, §5): a
 * render Task's Format defaults from a Channel, and a render Recipe becomes
 * one render per distinct Format among the publishing Recipes waiting on it.
 */

import { describe, expect, it } from 'vitest'
import { channelFormat, splitRendersByFormat } from './render-format'
import type { TaskRecipe } from './template/types'

const render = (over: Partial<TaskRecipe> = {}): TaskRecipe => ({
  key: 'cardRender',
  beat: 'card',
  title: 'Render: Card',
  kind: 'studioRender',
  subjectSource: 'speaker',
  ...over,
})

const post = (
  channel: 'linkedin' | 'bluesky',
  over: Partial<TaskRecipe> = {},
): TaskRecipe => ({
  key: `card:${channel}`,
  beat: 'card',
  title: 'Card',
  kind: 'publishing',
  channel,
  prerequisites: ['cardRender'],
  targetPage: '/',
  subjectSource: 'speaker',
  ...over,
})

const shape = (recipes: TaskRecipe[]) =>
  recipes.map((r) => ({
    key: r.key,
    format: r.format,
    prerequisites: r.prerequisites,
  }))

describe('channelFormat', () => {
  it('LinkedIn is landscape, Bluesky square, a manual or unset Channel square', () => {
    expect(channelFormat('linkedin')).toBe('landscape')
    expect(channelFormat('bluesky')).toBe('square')
    expect(channelFormat(null)).toBe('square')
    expect(channelFormat(undefined)).toBe('square')
  })
})

describe('splitRendersByFormat', () => {
  it('names the render of a second Format by it, so the two read apart on the timeline', () => {
    expect(
      splitRendersByFormat([render(), post('linkedin'), post('bluesky')])
        .filter((r) => r.kind === 'studioRender')
        .map((r) => r.title),
    ).toEqual(['Render: Card', 'Render: Card (Landscape)'])
  })

  it('LinkedIn and Bluesky at their defaults get two renders, each post waiting on its own', () => {
    expect(
      shape(
        splitRendersByFormat([render(), post('linkedin'), post('bluesky')]),
      ),
    ).toEqual([
      { key: 'cardRender', format: 'square', prerequisites: undefined },
      {
        key: 'cardRender:landscape',
        format: 'landscape',
        prerequisites: undefined,
      },
      {
        key: 'card:linkedin',
        format: undefined,
        prerequisites: ['cardRender:landscape'],
      },
      {
        key: 'card:bluesky',
        format: undefined,
        prerequisites: ['cardRender'],
      },
    ])
  })

  it('two Channels wanting square share one render', () => {
    expect(
      shape(
        splitRendersByFormat([
          render(),
          post('bluesky'),
          post('bluesky', { key: 'card:bluesky-reminder' }),
        ]),
      ),
    ).toEqual([
      { key: 'cardRender', format: 'square', prerequisites: undefined },
      {
        key: 'card:bluesky',
        format: undefined,
        prerequisites: ['cardRender'],
      },
      {
        key: 'card:bluesky-reminder',
        format: undefined,
        prerequisites: ['cardRender'],
      },
    ])
  })

  it('a LinkedIn-only beat gets one landscape render', () => {
    expect(shape(splitRendersByFormat([render(), post('linkedin')]))).toEqual([
      // One render: it keeps the Recipe's key, as every render before Formats.
      { key: 'cardRender', format: 'landscape', prerequisites: undefined },
      {
        key: 'card:linkedin',
        format: undefined,
        prerequisites: ['cardRender'],
      },
    ])
  })

  it('a render Recipe that names its Format is not split: every post waits on it', () => {
    expect(
      shape(
        splitRendersByFormat([
          render({ format: 'portrait' }),
          post('linkedin'),
          post('bluesky'),
        ]),
      ),
    ).toEqual([
      { key: 'cardRender', format: 'portrait', prerequisites: undefined },
      {
        key: 'card:linkedin',
        format: undefined,
        prerequisites: ['cardRender'],
      },
      {
        key: 'card:bluesky',
        format: undefined,
        prerequisites: ['cardRender'],
      },
    ])
  })

  it('a render nothing posts from takes the default of its own Channel', () => {
    expect(
      shape(
        splitRendersByFormat([
          render({ channel: 'linkedin' }),
          render({ key: 'otherRender', beat: 'other' }),
        ]),
      ),
    ).toEqual([
      { key: 'cardRender', format: 'landscape', prerequisites: undefined },
      { key: 'otherRender', format: 'square', prerequisites: undefined },
    ])
  })

  it('a post in the beat that does not list the render still waits on the one of its Format', () => {
    // `buildSubjectBeat` has always made every post of a beat wait on its
    // render; the split says which one.
    expect(
      shape(
        splitRendersByFormat([
          render(),
          post('linkedin', { prerequisites: undefined }),
          post('bluesky', { prerequisites: [] }),
        ]),
      ),
    ).toEqual([
      { key: 'cardRender', format: 'square', prerequisites: undefined },
      {
        key: 'cardRender:landscape',
        format: 'landscape',
        prerequisites: undefined,
      },
      {
        key: 'card:linkedin',
        format: undefined,
        prerequisites: ['cardRender:landscape'],
      },
      {
        key: 'card:bluesky',
        format: undefined,
        prerequisites: ['cardRender'],
      },
    ])
  })

  it('any other Task listing the render waits on every Format of it', () => {
    const checklist: TaskRecipe = {
      key: 'printCards',
      beat: 'print',
      title: 'Print the cards',
      kind: 'checklist',
      prerequisites: ['cardRender', 'somethingElse'],
      subjectSource: 'none',
    }
    const split = splitRendersByFormat([
      render(),
      post('linkedin'),
      post('bluesky'),
      checklist,
    ])
    expect(split.find((r) => r.key === 'printCards')?.prerequisites).toEqual([
      'cardRender',
      'cardRender:landscape',
      'somethingElse',
    ])
  })

  it('a post in another beat that lists the render explicitly counts too', () => {
    const split = splitRendersByFormat([
      render(),
      post('bluesky'),
      post('linkedin', { key: 'recap:linkedin', beat: 'recap' }),
    ])
    expect(shape(split).map((r) => [r.key, r.prerequisites])).toEqual([
      ['cardRender', undefined],
      ['cardRender:landscape', undefined],
      ['card:bluesky', ['cardRender']],
      ['recap:linkedin', ['cardRender:landscape']],
    ])
  })

  it('leaves a list without renders exactly as it was', () => {
    const recipes = [post('linkedin', { prerequisites: undefined })]
    expect(splitRendersByFormat(recipes)).toEqual(recipes)
  })
})
