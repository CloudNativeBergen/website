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

/**
 * `config()` echoes back — verbatim — the object the caller passed to
 * `createClient`. It is NOT a reimplementation of the real client's config
 * resolution: it applies no defaults and normalises nothing, so it is evidence
 * about ONE thing only, namely what `src/lib/sanity/client.ts` asks for
 * (`useCdn`, `token`, `perspective`, `requestTagPrefix`). Whether @sanity/client
 * then honours those is a property of the library, not of this repo, and cannot
 * be established here — see `__tests__/lib/sanity/cdn-client-config.test.ts`.
 */
export const createClient = vi.fn((config: Record<string, unknown> = {}) => ({
  config: () => config,
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
