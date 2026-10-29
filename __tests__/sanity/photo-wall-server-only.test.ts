/**
 * `photoWall` and `wallPost` are written only by the server (Photo Wall spec
 * §4, §12). `readOnly: true` locks the form and nothing else: Studio's
 * Delete, Duplicate, Unpublish and Restore, and "Create new", still write.
 * A Studio delete of a Wall Post would skip the §12 chain (no history purge,
 * an orphaned asset); a deleted wall would keep serving from the cached read,
 * since no tag expiry fires. So both types offer no writing action, and no
 * template to create one.
 */
import { describe, expect, it } from 'vitest'
import type { DocumentActionComponent, Template } from 'sanity'
import { photoWallSafeActions } from '../../sanity/actions/photoWallSafeActions'
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
  action('restore'),
]
const names = (list: readonly DocumentActionComponent[]) =>
  list.map((a) => a.action)

describe('Studio cannot write a Photo Wall or a Wall Post', () => {
  it.each(['photoWall', 'wallPost'])('offers no action on %s', (type) => {
    expect(names(photoWallSafeActions(ALL, type))).toEqual([])
  })

  it('leaves other types alone', () => {
    expect(names(photoWallSafeActions(ALL, 'sponsor'))).toEqual(names(ALL))
  })

  it('is wired into the real Studio config', () => {
    const actions = studioConfig.document?.actions
    if (typeof actions !== 'function') {
      throw new Error('sanity.config.ts no longer configures document.actions')
    }
    const resolve = (schemaType: string) =>
      actions(ALL, {
        schemaType,
      } as unknown as Parameters<
        typeof actions
      >[1]) as DocumentActionComponent[]
    expect(resolve('photoWall')).toEqual([])
    expect(resolve('wallPost')).toEqual([])
    expect(resolve('sponsor')).toHaveLength(ALL.length)
  })

  it('offers no template to create either type', () => {
    const templates = studioConfig.schema?.templates
    if (typeof templates !== 'function') {
      throw new Error('sanity.config.ts no longer filters schema.templates')
    }
    const template = (schemaType: string) =>
      ({ id: schemaType, schemaType, title: schemaType, value: {} }) as Template
    const all = ['photoWall', 'wallPost', 'talk'].map(template)
    const kept = (templates as (prev: Template[]) => Template[])(all).map(
      (t) => t.schemaType,
    )
    expect(kept).toEqual(['talk'])
  })
})
