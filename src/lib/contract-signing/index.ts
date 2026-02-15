import type { ContractSigningProvider } from './types'
import { AdobeSignProvider } from './adobe-sign'

export type { ContractSigningProvider } from './types'
export type {
  SendForSigningResult,
  SigningStatusResult,
  SigningProviderStatus,
} from './types'

/**
 * Returns the configured contract signing provider.
 *
 * Currently always returns the Adobe Sign provider.  When additional
 * providers are added (e.g. DocuSign), this factory can inspect an
 * env var or conference setting to decide which provider to return.
 */
export function getSigningProvider(): ContractSigningProvider {
  return new AdobeSignProvider()
}
