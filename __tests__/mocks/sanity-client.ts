import { vi } from 'vitest'

export const createClient = vi.fn(() => ({
  fetch: vi.fn(),
  create: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(() => ({
    create: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
}))
