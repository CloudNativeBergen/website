import { PortableTextBlock } from '@portabletext/editor'

// Export functions for potential use in other modules
export function convertStringToPortableTextBlocks(
  input: PortableTextBlock[] | string | undefined,
): PortableTextBlock[] {
  if (!input) {
    return []
  }

  const inputIsAlreadyAPortableTextBlock = typeof input !== 'string'
  if (inputIsAlreadyAPortableTextBlock) {
    return input
  }

  return input.split('\n\n').map(
    (paragraph) =>
      ({
        _key: crypto.randomUUID(),
        _type: 'block',
        style: 'normal',
        children: [
          {
            _type: 'span',
            marks: [],
            text: paragraph,
          },
        ],
        markDefs: [],
      }) as PortableTextBlock,
  )
}
