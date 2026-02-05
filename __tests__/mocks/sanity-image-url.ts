import { jest } from '@jest/globals'

export const createImageUrlBuilder = jest.fn(() => ({
  image: jest.fn(() => ({
    url: jest.fn(() => 'https://example.com/image.png'),
  })),
}))
