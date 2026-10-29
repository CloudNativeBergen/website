import type { DocumentActionComponent } from 'sanity'

/**
 * The Photo Wall's document types (Photo Wall spec §4), written only by the
 * server: organizers set a wall up and moderate it on `/admin/photo-wall`.
 */
export const PHOTO_WALL_TYPES: ReadonlySet<string> = new Set([
  'photoWall',
  'wallPost',
])

/**
 * No Studio action on a Photo Wall type. `readOnly: true` locks the form
 * only; Delete, Duplicate, Unpublish and Restore still write. A Studio delete
 * of a Wall Post would skip the §12 delete (no history purge, an orphaned
 * asset), and a deleted wall would keep serving from its cached read.
 */
export function photoWallSafeActions(
  actions: readonly DocumentActionComponent[],
  schemaType: string,
): DocumentActionComponent[] {
  return PHOTO_WALL_TYPES.has(schemaType) ? [] : [...actions]
}
