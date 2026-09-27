/**
 * A render Task's gallery entry is found by its weak `task` reference (#1165).
 * Studio's Duplicate copies every field, hidden and read-only ones included,
 * so a duplicate of an entry would carry the same `task` — and once the
 * original is gone, the next re-render would silently repurpose the
 * organizer's copy. Duplicate is therefore hidden on an entry that holds a
 * Task, and left alone on every other gallery asset.
 */
import { describe, expect, it, vi } from 'vitest'
import type {
  DocumentActionComponent,
  DocumentActionDescription,
  DocumentActionProps,
} from 'sanity'
import { taskEntrySafeActions } from '../../sanity/actions/taskEntrySafeActions'
import studioConfig from '../../sanity.config'

const DESCRIPTION = { label: 'Duplicate' } as DocumentActionDescription
function action(name: string) {
  const component = vi.fn(
    () => DESCRIPTION,
  ) as unknown as DocumentActionComponent
  component.action = name as DocumentActionComponent['action']
  return component
}
const props = (doc: Record<string, unknown> | null) =>
  ({
    id: 'a',
    type: 'marketingAsset',
    published: doc,
    draft: null,
  }) as unknown as DocumentActionProps
const duplicateOf = (list: readonly DocumentActionComponent[]) =>
  list.find((a) => a.action === 'duplicate')!
const ENTRY = { _id: 'a', task: { _ref: 'marketingTask.x', _weak: true } }

describe('Studio cannot duplicate a render Task gallery entry', () => {
  it('hides Duplicate on an entry that holds a Task', () => {
    const duplicate = duplicateOf(
      taskEntrySafeActions([action('duplicate')], 'marketingAsset'),
    )
    expect(duplicate.action).toBe('duplicate')
    expect(duplicate(props(ENTRY))).toBeNull()
    // Its draft counts too.
    expect(
      duplicate({
        ...props(null),
        draft: ENTRY,
      } as unknown as DocumentActionProps),
    ).toBeNull()
  })

  it('keeps Duplicate on every other gallery asset', () => {
    const duplicate = duplicateOf(
      taskEntrySafeActions([action('duplicate')], 'marketingAsset'),
    )
    expect(duplicate(props({ _id: 'a', title: 'Logo' }))).toBe(DESCRIPTION)
  })

  it('is wired into the real Studio config', () => {
    const actions = studioConfig.document?.actions
    if (typeof actions !== 'function')
      throw new Error('sanity.config.ts no longer configures document.actions')
    const resolved = actions([action('duplicate')], {
      schemaType: 'marketingAsset',
    } as unknown as Parameters<typeof actions>[1]) as DocumentActionComponent[]
    expect(duplicateOf(resolved)(props(ENTRY))).toBeNull()
  })
})
