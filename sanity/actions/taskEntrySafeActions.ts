import type { DocumentActionComponent } from 'sanity'

/**
 * Hide Studio's Duplicate on a render Task's gallery entry (#1165).
 *
 * The entry is found by its weak `task` reference. Duplicate copies every
 * field, hidden and read-only ones included, so a copy would carry the same
 * Task — and once the original is deleted, the next re-render would silently
 * repurpose the organizer's copy. Every other gallery asset keeps Duplicate.
 *
 * The original action is always called, so its hooks run in the same order
 * whatever the document holds; its description is only withheld.
 */
export function taskEntrySafeActions(
  actions: readonly DocumentActionComponent[],
  schemaType: string,
): DocumentActionComponent[] {
  if (schemaType !== 'marketingAsset') return [...actions]
  return actions.map((original) => {
    if (original.action !== 'duplicate') return original
    const guarded: DocumentActionComponent = (props) => {
      const description = original(props)
      const doc = (props.draft ?? props.published) as {
        task?: unknown
      } | null
      return doc?.task ? null : description
    }
    guarded.action = original.action
    return guarded
  })
}
