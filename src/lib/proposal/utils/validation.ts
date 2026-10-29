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

export function convertPortableTextToString(
  input: PortableTextBlock[] | string | undefined,
): string {
  if (!input) {
    return ''
  }
  if (typeof input === 'string') {
    return input
  }
  return input
    .map((block) => {
      if (block._type === 'block' && Array.isArray(block.children)) {
        return block.children
          .map((child) =>
            typeof child === 'object' && child && 'text' in child
              ? String(child.text ?? '')
              : '',
          )
          .join('')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}
