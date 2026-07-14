/**
 * Minimal ambient declarations for the Digital Bazaar Data Integrity stack
 * used by src/lib/openbadges/crypto.ts. These packages ship no TypeScript
 * types; the values we consume are wrapped in typed functions in crypto.ts.
 */

declare module '@digitalbazaar/vc' {
  /**
   * Minimal typed surface for the two entry points crypto.ts consumes.
   * Typing at least verifyCredential's `verified` result guards against the
   * trust-anchor regression where a truthy-but-wrong result object was read
   * as success. Inputs stay loose (the DB stack is dynamically shaped).
   */
  export function issue(options: {
    credential: Record<string, unknown>
    suite: unknown
    documentLoader: (url: string) => Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<Record<string, any>>

  export function verifyCredential(options: {
    credential: Record<string, unknown>
    suite: unknown
    documentLoader: (url: string) => Promise<unknown>
    purpose?: unknown
  }): Promise<{
    verified: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results?: Array<{ verified: boolean; error?: unknown; [key: string]: any }>
    error?: unknown
  }>
}
declare module '@digitalbazaar/data-integrity'
declare module '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
declare module '@digitalbazaar/ed25519-multikey'
declare module '@digitalbazaar/security-document-loader'
declare module 'jsonld-signatures'
