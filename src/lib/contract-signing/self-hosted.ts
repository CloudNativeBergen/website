import { randomUUID } from 'crypto'

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import type { SignatureStatus } from '@/lib/sponsor-crm/types'

import type {
  ContractSigningProvider,
  SendForSigningResult,
  SigningProviderStatus,
  SigningStatusResult,
} from './types'

const PROVIDER_NAME = 'Self-Hosted'

const STATUS_QUERY = `*[_type == "sponsorForConference" && signatureId == $id][0]{ signatureStatus }`
const ID_QUERY = `*[_type == "sponsorForConference" && signatureId == $id][0]{ _id }`

/**
 * Self-hosted contract signing provider.
 *
 * Instead of delegating to an external service (Adobe Sign, DocuSign, etc.)
 * this provider generates a unique token, stores it in the sponsor record,
 * and constructs a signing URL that points to the application itself.
 *
 * The actual signature capture (canvas pad -> PNG -> embedded in PDF) is
 * handled by the signing page + tRPC router — this provider only manages
 * the lifecycle metadata stored in Sanity.
 */
export class SelfHostedSigningProvider implements ContractSigningProvider {
  readonly name = PROVIDER_NAME

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendForSigning(params: {
    pdf: Buffer
    filename: string
    signerEmail: string
    agreementName: string
    message?: string
  }): Promise<SendForSigningResult> {
    const token = randomUUID()

    const rawBaseUrl =
      process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL
    if (!rawBaseUrl) {
      throw new Error(
        'Missing NEXTAUTH_URL or NEXT_PUBLIC_BASE_URL for self-hosted signing URL',
      )
    }

    const origin = new URL(rawBaseUrl).origin
    const signingUrl = new URL(
      `/sponsor/contract/sign/${token}`,
      origin,
    ).toString()

    return { agreementId: token, signingUrl }
  }

  async checkStatus(agreementId: string): Promise<SigningStatusResult> {
    const doc = await clientReadUncached.fetch<{
      signatureStatus?: SignatureStatus
    } | null>(STATUS_QUERY, { id: agreementId })

    const status: SignatureStatus = doc?.signatureStatus ?? 'not-started'
    return { status, providerStatus: status }
  }

  async cancelAgreement(agreementId: string): Promise<void> {
    const doc = await clientReadUncached.fetch<{ _id: string } | null>(
      ID_QUERY,
      { id: agreementId },
    )
    if (!doc) return

    await clientWrite
      .patch(doc._id)
      .set({ signatureStatus: 'rejected' as SignatureStatus })
      .commit()
  }

  async sendReminder(): Promise<void> {
    // Self-hosted provider does not support reminders.
  }

  async getConnectionStatus(): Promise<SigningProviderStatus> {
    return {
      connected: true,
      providerName: PROVIDER_NAME,
      detail: 'Built-in signing — no external service required.',
    }
  }

  async getAuthorizeUrl(): Promise<{ url: string; state: string }> {
    return { url: '', state: '' }
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect.
  }

  async registerWebhook(): Promise<{ webhookId: string; existing: boolean }> {
    return { webhookId: '', existing: true }
  }
}
