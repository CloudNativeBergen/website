import { vi } from 'vitest'

function createChainableBuilder() {
  const builder: Record<string, any> = {}
  const chainMethods = [
    'image',
    'width',
    'height',
    'rect',
    'fit',
    'quality',
    'auto',
  ]
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder)
  }
  builder.url = vi.fn(() => 'https://cdn.sanity.io/images/mock/image.png')
  return builder
}

/**
 * One builder for the whole run. `src/lib/sanity/client.ts` creates its builder
 * at import time, so tests read calls from this export rather than from
 * `createImageUrlBuilder.mock.results`, which Vitest's `clearMocks` wipes.
 */
export const builder = createChainableBuilder() as Record<
  string,
  ReturnType<typeof vi.fn>
>

export const createImageUrlBuilder = vi.fn(() => builder)
