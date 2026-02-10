import { Reference } from 'sanity'

export function generateKey(prefix: string = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export function ensureArrayKeys<T extends Record<string, unknown>>(
  array: T[],
  prefix: string = 'item',
): Array<T & { _key: string }> {
  if (!Array.isArray(array)) return array as Array<T & { _key: string }>
  return array.map((item) => ({
    ...item,
    _key: (item._key as string) || generateKey(prefix),
  }))
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
