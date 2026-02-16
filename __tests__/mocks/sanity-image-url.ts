import { vi } from 'vitest'

export const createImageUrlBuilder = vi.fn(() => ({
  image: vi.fn(() => ({
    url: vi.fn(() => 'https://example.com/image.png'),
  })),
}))
