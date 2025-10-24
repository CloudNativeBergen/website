import { Reference } from 'sanity'
import { clientWrite, clientReadUncached as clientRead } from './client'

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

export async function addReferenceToArray(
  documentId: string,
  arrayField: string,
  referenceId: string,
  additionalData?: Record<string, unknown>,
  keyPrefix: string = 'ref',
): Promise<{ error?: Error }> {
  try {
    const document = await clientRead.fetch(
      `*[_id == $documentId][0]{
        _id,
        ${arrayField}
      }`,
      { documentId },
    )

    if (!document) {
      return { error: new Error('Document not found') }
    }

    const existingArray = (document[arrayField] || []) as Record<
      string,
      unknown
    >[]
    const existingRef = existingArray.find(
      (item) =>
        item._ref === referenceId ||
        (item[keyPrefix.slice(0, -1)] as Record<string, unknown>)?._ref ===
          referenceId,
    )

    if (existingRef) {
      return { error: new Error('Reference already exists in array') }
    }

    const arrayWithKeys = existingArray.map((item) => ({
      ...item,
      _key: (item._key as string) || generateKey(keyPrefix),
    }))

    const newReference = {
      _key: generateKey(keyPrefix),
      ...additionalData,
      ...(additionalData ? {} : { _type: 'reference', _ref: referenceId }),
    }

    const updatedArray = [...arrayWithKeys, newReference]

    await clientWrite
      .patch(documentId)
      .set({ [arrayField]: updatedArray })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}

export async function removeReferenceFromArray(
  documentId: string,
  arrayField: string,
  referenceId: string,
  keyPrefix: string = 'ref',
): Promise<{ error?: Error }> {
  try {
    const document = await clientRead.fetch(
      `*[_id == $documentId][0]{
        _id,
        ${arrayField}
      }`,
      { documentId },
    )

    if (!document) {
      return { error: new Error('Document not found') }
    }

    const existingArray = (document[arrayField] || []) as Record<
      string,
      unknown
    >[]

    const referenceField = keyPrefix === 'ref' ? '_ref' : keyPrefix

    const updatedArray = existingArray
      .filter((item) => {
        if (item._ref === referenceId) return false

        if (referenceField !== '_ref') {
          const nestedRef = item[referenceField] as Record<string, unknown>
          if (nestedRef && nestedRef._ref === referenceId) return false
        }

        return true
      })
      .map((item) => ({
        ...item,
        _key: (item._key as string) || generateKey(keyPrefix),
      }))

    await clientWrite
      .patch(documentId)
      .set({ [arrayField]: updatedArray })
      .commit()

    return {}
  } catch (error) {
    return { error: error as Error }
  }
}
