import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * The REAL `jose`, for a suite whose claims depend on encryption actually
 * happening. `vitest.config.ts` aliases `jose` to a stub for the whole suite,
 * and `vi.unmock` does not reach a resolve-level alias; a factory does:
 *
 *     vi.mock('jose', async () => (await import('<path>/realJose')).realJose())
 *
 * Node's own resolver finds the package, since any specifier starting with
 * `jose` is aliased.
 */
export function realJose(): Promise<typeof import('jose')> {
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
}
