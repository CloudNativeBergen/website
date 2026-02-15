import type { ContractSigningProvider } from './types'
import { AdobeSignProvider } from './adobe-sign'
import { SelfHostedSigningProvider } from './self-hosted'

export type { ContractSigningProvider } from './types'
export type {
  SendForSigningResult,
  SigningStatusResult,
  SigningProviderStatus,
} from './types'

/**
 * Returns the configured contract signing provider.
 *
 * Set `CONTRACT_SIGNING_PROVIDER` to choose a provider:
 *   - `"adobe-sign"` — Adobe Sign (default)
 *   - `"self-hosted"` — built-in signature pad, no external service
 */
export function getSigningProvider(): ContractSigningProvider {
  const provider = process.env.CONTRACT_SIGNING_PROVIDER ?? 'adobe-sign'

  switch (provider) {
    case 'self-hosted':
      return new SelfHostedSigningProvider()
    case 'adobe-sign':
    default:
      return new AdobeSignProvider()
  }
}
