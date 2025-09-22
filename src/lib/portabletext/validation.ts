import { PortableTextBlock } from '@portabletext/types'

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

export function isValidPortableText(
  data: unknown,
): data is PortableTextBlock[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(isValidPortableTextBlock)
  )
}
