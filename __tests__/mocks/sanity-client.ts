import { vi } from 'vitest'

export const groq = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string =>
  strings.reduce(
    (query, str, i) =>
      query + str + (i < values.length ? String(values[i]) : ''),
    '',
  )

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
