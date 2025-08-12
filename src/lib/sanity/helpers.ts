import { Reference } from 'sanity'
import { clientWrite, clientReadUncached as clientRead } from './client'

/**
 * Generate a unique key for Sanity array items
 */
export function generateKey(prefix: string = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Add _key properties to array items if they don't exist
 */
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

/**
 * Create a Sanity reference object
 */
export function createReference(id: string): Reference {
  return { _type: 'reference', _ref: id }
}

/**
 * Create a Sanity reference object with _key
 */
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

/**
 * Prepare any array with _key properties
 */
export function prepareArrayWithKeys<T extends Record<string, unknown>>(
  items: T[] | undefined,
  prefix: string = 'item',
): Array<T & { _key: string }> | undefined {
  if (!items || !Array.isArray(items)) return undefined
  return ensureArrayKeys(items, prefix)
}

/**
 * Prepare reference array with _key properties
 */
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

/**
 * Generic function to fix missing _key attributes in arrays for any document type
 */
export async function fixArrayKeys(
  documentType: string,
  arrayFields: Array<{
    field: string
    prefix: string
    keyCheck?: (item: Record<string, unknown>) => boolean
  }>,
): Promise<{
  error?: Error
  fixed?: number
}> {
  try {
    const documents = await clientRead.fetch(`
      *[_type == "${documentType}"]{
        _id,
        ${arrayFields.map((field) => field.field).join(',\n        ')}
      }
    `)

    let fixedCount = 0

    for (const document of documents) {
      let needsUpdate = false
      const updates: Record<string, unknown[]> = {}

      for (const { field, prefix, keyCheck } of arrayFields) {
        if (document[field] && Array.isArray(document[field])) {
          const arrayWithKeys = (
            document[field] as Record<string, unknown>[]
          ).map((item) => {
            const shouldAddKey = keyCheck ? keyCheck(item) : !item._key
            if (shouldAddKey) {
              needsUpdate = true
              return {
                ...item,
                _key: (item._key as string) || generateKey(prefix),
              }
            }
            return item
          })

          if (needsUpdate) {
            updates[field] = arrayWithKeys
          }
        }
      }

      if (needsUpdate) {
        await clientWrite.patch(document._id).set(updates).commit()
        fixedCount++
      }
    }

    return { fixed: fixedCount }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * Generic function to add a reference to an array field in a document
 */
export async function addReferenceToArray(
  documentId: string,
  arrayField: string,
  referenceId: string,
  additionalData?: Record<string, unknown>,
  keyPrefix: string = 'ref',
): Promise<{ error?: Error }> {
  try {
    // Get the current document data
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

    // Check if reference already exists
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

    // Ensure all existing items have _key properties
    const arrayWithKeys = existingArray.map((item) => ({
      ...item,
      _key: (item._key as string) || generateKey(keyPrefix),
    }))

    // Add the new reference
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

/**
 * Generic function to remove a reference from an array field in a document
 */
export async function removeReferenceFromArray(
  documentId: string,
  arrayField: string,
  referenceId: string,
  keyPrefix: string = 'ref',
): Promise<{ error?: Error }> {
  try {
    // Get the current document data
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

    // Remove the reference and ensure remaining ones have _key properties
    const existingArray = (document[arrayField] || []) as Record<
      string,
      unknown
    >[]

    // For nested references, use the keyPrefix as the field name directly
    const referenceField = keyPrefix === 'ref' ? '_ref' : keyPrefix

    const updatedArray = existingArray
      .filter((item) => {
        // Check direct reference
        if (item._ref === referenceId) return false

        // Check nested reference
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
