/**
 * A `/go/<code>` code must be unique within the conference (short-links spec
 * §2.2). Studio's Duplicate action copies every field of a document, and
 * `readOnly` does not stop it — so duplicating a coded outreach Task or a
 * coded variant would produce two live documents sharing one code, and the
 * resolver's unordered `[0]` would redirect to whichever came back first.
 *
 * The Duplicate action is therefore removed for the two carrier types.
 */
import { describe, expect, it } from 'vitest'
import type { DocumentActionComponent } from 'sanity'
import {
  shortCodeSafeActions,
  SHORT_CODE_TYPES,
} from '../../sanity/actions/shortCodeSafeActions'
import studioConfig from '../../sanity.config'

const action = (name: string): DocumentActionComponent => {
  const component = (() => null) as unknown as DocumentActionComponent
  component.action = name as DocumentActionComponent['action']
  return component
}

const ALL = [
  action('publish'),
  action('duplicate'),
  action('delete'),
  action('unpublish'),
]
const names = (list: readonly DocumentActionComponent[]) =>
  list.map((a) => a.action)

describe('Studio cannot duplicate a document that carries a short code', () => {
  it.each([...SHORT_CODE_TYPES])('drops Duplicate for %s', (schemaType) => {
    expect(names(shortCodeSafeActions(ALL, schemaType))).not.toContain(
      'duplicate',
    )
  })

  it('keeps every OTHER action on those types', () => {
    expect(names(shortCodeSafeActions(ALL, 'marketingTask'))).toEqual([
      'publish',
      'delete',
      'unpublish',
    ])
  })

  it('leaves Duplicate alone on a type with no short code', () => {
    expect(names(shortCodeSafeActions(ALL, 'talk'))).toContain('duplicate')
    expect(names(shortCodeSafeActions(ALL, 'talk'))).toEqual(names(ALL))
  })

  it('is WIRED INTO the real Studio config, not merely available', () => {
    // Without this, deleting the call from `sanity.config.ts` would leave
    // every assertion above green while Studio still offered Duplicate.
    const actions = studioConfig.document?.actions
    if (typeof actions !== 'function') {
      throw new Error('sanity.config.ts no longer configures document.actions')
    }
    const resolve = (schemaType: string) =>
      names(
        actions(ALL, {
          schemaType,
        } as unknown as Parameters<
          typeof actions
        >[1]) as DocumentActionComponent[],
      )
    for (const schemaType of SHORT_CODE_TYPES) {
      expect(resolve(schemaType)).not.toContain('duplicate')
    }
    // And the config still offers it everywhere else, and still wraps publish.
    expect(resolve('talk')).toContain('duplicate')
    expect(resolve('talk')).toHaveLength(ALL.length)
  })

  it('names exactly the two types that carry a code', () => {
    expect([...SHORT_CODE_TYPES].sort()).toEqual([
      'marketingTask',
      'socialPostVariant',
    ])
  })
})
