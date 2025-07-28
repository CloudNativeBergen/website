import { PortableTextBlock } from '@portabletext/types'

/**
 * Validates if an unknown object is a valid PortableText block
 */
export function isValidPortableTextBlock(
  obj: unknown,
): obj is PortableTextBlock {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    '_type' in obj &&
    '_key' in obj &&
    typeof (obj as { _type: unknown })._type === 'string' &&
    typeof (obj as { _key: unknown })._key === 'string'
  )
}

/**
 * Validates if an unknown value is a valid array of PortableText blocks
 */
export function isValidPortableText(
  data: unknown,
): data is PortableTextBlock[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(isValidPortableTextBlock)
  )
}
