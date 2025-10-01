import { jest } from '@jest/globals'

export const createClient = jest.fn(() => ({
  fetch: jest.fn(),
  create: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  transaction: jest.fn(() => ({
    create: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(),
  })),
}))
