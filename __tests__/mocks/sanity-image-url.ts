import { vi } from 'vitest'

function createChainableBuilder() {
  const builder: Record<string, any> = {}
  const chainMethods = ['image', 'width', 'height', 'fit', 'quality']
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder)
  }
  builder.url = vi.fn(() => 'https://cdn.sanity.io/images/mock/image.png')
  return builder
}

export const createImageUrlBuilder = vi.fn(() => createChainableBuilder())
