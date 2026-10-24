/**
 * THE STUDIO HALF of `photoWall.postingMode` (Photo Wall spec §4.1, §7).
 *
 * The field is read-only in Studio, so its options and preview are what an
 * editor reads the mode from: every mode the switch offers is listed, and the
 * preview names a missing mode Automatic (as `postingModeOf` reads it) and an
 * unrecognised one Paused (never Open).
 */
import { describe, expect, it } from 'vitest'
import photoWall from '../../sanity/schemaTypes/photoWall'
import { POSTING_MODES } from '@/lib/photo-wall/types'

type Field = { name?: string; options?: { list?: unknown[] } }
type Preview = {
  prepare: (v: { title?: string; mode?: string }) => {
    title: string
    subtitle: string
  }
}

const field = (photoWall.fields as Field[]).find(
  (f) => f.name === 'postingMode',
)!
const prepare = (photoWall.preview as Preview).prepare

describe('photoWall.postingMode in Studio', () => {
  it('lists every mode the switch offers, labelled', () => {
    expect(field.options?.list).toEqual([
      { title: 'Automatic', value: 'auto' },
      { title: 'Open', value: 'open' },
      { title: 'Paused', value: 'paused' },
    ])
    expect(
      (field.options!.list as { value: string }[]).map((o) => o.value),
    ).toEqual([...POSTING_MODES])
  })

  it.each([
    ['auto', 'Automatic'],
    ['open', 'Open'],
    ['paused', 'Paused'],
    [undefined, 'Automatic'],
    ['always', 'Paused'],
    [null, 'Automatic'],
    // Names an object inherits: never a label, always Paused.
    ['__proto__', 'Paused'],
    ['constructor', 'Paused'],
    ['toString', 'Paused'],
  ])('previews the mode %j as %s', (mode, subtitle) => {
    expect(prepare({ title: 'CND 2026', mode })).toEqual({
      title: 'Photo Wall: CND 2026',
      subtitle,
    })
  })

  it('previews a wall whose conference has no title as Photo Wall', () => {
    expect(prepare({ mode: 'open' })).toEqual({
      title: 'Photo Wall',
      subtitle: 'Open',
    })
  })
})
