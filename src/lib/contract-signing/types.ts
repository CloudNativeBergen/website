import type { SignatureStatus } from '@/lib/sponsor-crm/types'

/** Result of sending a contract for digital signing. */
export interface SendForSigningResult {
  agreementId: string
  signingUrl?: string
}

/** Status returned when polling a signing provider. */
export interface SigningStatusResult {
  /** Provider-agnostic status. */
  status: SignatureStatus
  /** Raw status string from the provider (for logging / debugging). */
  providerStatus: string
}

/** Connection status of a signing provider. */
export interface SigningProviderStatus {
  connected: boolean
  /** Provider display name (e.g. "Adobe Sign", "DocuSign"). */
  providerName: string
  /** When the current session/token expires, if applicable. */
  expiresAt?: number | null
  /** Provider-specific detail, e.g. API endpoint. */
  detail?: string | null
  /** Whether a webhook is registered and active. */
  webhookActive?: string | null
}

/**
 * Provider-agnostic contract signing interface.
 *
 * The sponsor system interacts with this interface only — never with
 * provider-specific APIs directly.  Each provider (Adobe Sign, DocuSign, etc.)
 * implements this interface and is selected via the provider factory.
 */
export interface ContractSigningProvider {
  /** Human-readable name of this provider. */
  readonly name: string

  // ── Signing operations ────────────────────────────────────────────

  /**
   * Upload a contract PDF and create a signing request.
   * Returns the provider's agreement ID and (optionally) a signing URL.
   */
  sendForSigning(params: {
    pdf: Buffer
    filename: string
    signerEmail: string
    agreementName: string
    message?: string
    baseUrl?: string
  }): Promise<SendForSigningResult>

  /**
   * Poll the provider to get the current signing status of an agreement.
   */
  checkStatus(agreementId: string): Promise<SigningStatusResult>

  /**
   * Cancel / void an in-progress signing agreement.
   * Should not throw if the agreement is already cancelled or completed.
   */
  cancelAgreement(agreementId: string): Promise<void>

  /**
   * Send a reminder to the signer for a pending agreement.
   */
  sendReminder(agreementId: string): Promise<void>

  // ── Connection management ─────────────────────────────────────────

  /** Check whether the provider is connected and ready to use. */
  getConnectionStatus(): Promise<SigningProviderStatus>

  /** Build the OAuth authorization URL (if the provider uses OAuth). */
  getAuthorizeUrl(redirectUri: string): Promise<{ url: string; state: string }>

  /** Revoke / clear the current provider session. */
  disconnect(): Promise<void>

  // ── Webhook management ────────────────────────────────────────────

  /**
   * Register a webhook with the provider for real-time status updates.
   * Returns { webhookId, existing } — `existing` is true if a matching
   * webhook was already registered.
   */
  registerWebhook(
    webhookUrl: string,
  ): Promise<{ webhookId: string; existing: boolean }>
}
