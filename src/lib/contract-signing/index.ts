import type { ContractSigningProvider } from './types'
import { SelfHostedSigningProvider } from './self-hosted'

export type { ContractSigningProvider } from './types'
export type {
  SendForSigningResult,
  SigningStatusResult,
  SigningProviderStatus,
} from './types'

/**
 * The only supported signing provider. Historically this was a union that also
 * included `'adobe-sign'`; that provider has been removed. Legacy conference
 * documents may still carry the old stored value — see {@link getSigningProvider}
 * for how those are handled gracefully.
 */
export type SigningProviderType = 'self-hosted'

/**
 * Returns a contract signing provider instance.
 *
 * Self-hosted signing is the only supported provider. Any other value —
 * including the legacy `'adobe-sign'` stored on older conference documents or
 * a stale `CONTRACT_SIGNING_PROVIDER` env var — is tolerated and falls back to
 * self-hosted with a warning. Nothing throws on an unknown value.
 *
 * @param providerType - Provider value from conference settings (may be a
 *   legacy/unknown string). Falls back to the `CONTRACT_SIGNING_PROVIDER` env
 *   var, then `"self-hosted"`.
 */
export function getSigningProvider(
  providerType?: string | null,
): ContractSigningProvider {
  const provider =
    providerType ?? process.env.CONTRACT_SIGNING_PROVIDER ?? 'self-hosted'

  if (provider !== 'self-hosted') {
    console.warn(
      `[contract-signing] Unsupported signing provider "${provider}"; falling back to self-hosted.`,
    )
  }

  return new SelfHostedSigningProvider()
}
