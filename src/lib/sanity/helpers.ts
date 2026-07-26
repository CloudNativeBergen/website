import { Reference } from 'sanity'
import { nanoid } from 'nanoid'

export function generateKey(prefix: string = 'item'): string {
  return `${prefix}-${nanoid()}`
}

/**
 * GROQ projection fragment that strips a speaker's sensitive web-push fields
 * (#444) out of any `...` spread. `pushSubscriptions` holds push endpoint URLs
 * plus the `p256dh`/`auth` crypto keys; `pushPreferences` holds per-category
 * opt-outs. These are read ONLY by the push server code
 * (`src/lib/push/sanity.ts`, keyed by speaker id) and must never ride along in
 * the general speaker projections that flow to clients or public surfaces.
 *
 * Append AFTER a `...` spread so the explicit `null`s override the spread's
 * copies, e.g. `{ ..., ${EXCLUDE_PUSH_FIELDS}, "slug": slug.current }`.
 */
export const EXCLUDE_PUSH_FIELDS =
  '"pushSubscriptions": null, "pushPreferences": null'

export function ensureArrayKeys<T extends Record<string, unknown>>(
  array: T[],
  prefix: string = 'item',
): Array<T & { _key: string }> {
  if (!Array.isArray(array)) return array as Array<T & { _key: string }>
  return array.map((item) => ({
    ...item,
    // Only a non-empty STRING satisfies Sanity's `_key` contract (and this
    // function's return type) — any other truthy value is replaced.
    _key:
      typeof item._key === 'string' && item._key
        ? item._key
        : generateKey(prefix),
  }))
}

/**
 * {@link ensureArrayKeys} + UNIQUENESS: client-supplied `_key`s are kept only
 * for their FIRST occurrence — a duplicate is dropped and regenerated, since
 * duplicate keys corrupt Sanity array addressing and React reconciliation.
 * Use this for any array persisted from client input.
 */
export function ensureUniqueArrayKeys<T extends Record<string, unknown>>(
  array: T[],
  prefix: string = 'item',
): Array<T & { _key: string }> {
  if (!Array.isArray(array)) return array as Array<T & { _key: string }>
  const seen = new Set<string>()
  return ensureArrayKeys(
    array.map((item) => {
      const key =
        typeof item._key === 'string' && item._key ? item._key : undefined
      if (!key) return item
      if (!seen.has(key)) {
        seen.add(key)
        return item
      }
      // Duplicate: strip the key so ensureArrayKeys regenerates it.
      const rest = { ...item }
      delete rest._key
      return rest
    }),
    prefix,
  )
}

export function createReference(id: string): Reference {
  return { _type: 'reference', _ref: id }
}

export function createReferenceWithKey(
  id: string,
  prefix: string = 'ref',
): Reference & { _key: string } {
  return {
    _type: 'reference',
    _ref: id,
    _key: generateKey(prefix),
  }
}

export function prepareArrayWithKeys<T extends Record<string, unknown>>(
  items: T[] | undefined,
  prefix: string = 'item',
): Array<T & { _key: string }> | undefined {
  if (!items || !Array.isArray(items)) return undefined
  return ensureArrayKeys(items, prefix)
}

export function prepareReferenceArray<T extends Reference | { _id: string }>(
  items?: T[],
  prefix: string = 'ref',
): Array<Reference & { _key: string }> | undefined {
  if (!items || !Array.isArray(items)) return undefined

  const refs = items.map((item) =>
    typeof item === 'object' && '_id' in item
      ? { _type: 'reference', _ref: item._id }
      : (item as Reference),
  )

  return refs.map((ref) => ({
    ...ref,
    _key: (ref as Reference & { _key?: string })._key || generateKey(prefix),
  })) as Array<Reference & { _key: string }>
}
