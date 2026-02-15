import type { ContractSigningProvider } from './types'
import { AdobeSignProvider } from './adobe-sign'
import { SelfHostedSigningProvider } from './self-hosted'

export type { ContractSigningProvider } from './types'
export type {
  SendForSigningResult,
  SigningStatusResult,
  SigningProviderStatus,
} from './types'

export type SigningProviderType = 'self-hosted' | 'adobe-sign'

/**
 * Returns a contract signing provider instance.
 *
 * @param providerType - Explicit provider type (from conference settings).
 *   Falls back to the `CONTRACT_SIGNING_PROVIDER` env var, then `"self-hosted"`.
 */
export function getSigningProvider(
  providerType?: SigningProviderType | null,
): ContractSigningProvider {
  const provider =
    providerType ?? process.env.CONTRACT_SIGNING_PROVIDER ?? 'self-hosted'

  switch (provider) {
    case 'adobe-sign':
      return new AdobeSignProvider()
    case 'self-hosted':
    default:
      return new SelfHostedSigningProvider()
  }
}
