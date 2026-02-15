import type {
  ContractSigningProvider,
  SendForSigningResult,
  SigningStatusResult,
  SigningProviderStatus,
} from './types'
import type { SignatureStatus } from '@/lib/sponsor-crm/types'
import {
  uploadTransientDocument,
  createAgreement,
  getAgreement,
  getSigningUrls,
  registerWebhook,
  listWebhooks,
  sendReminder as adobeSendReminder,
  cancelAgreement as adobeCancelAgreement,
} from '@/lib/adobe-sign/client'
import {
  getAdobeSignSession,
  clearAdobeSignSession,
  getAuthorizeUrl as adobeGetAuthorizeUrl,
} from '@/lib/adobe-sign/auth'
import type { AdobeSignSession } from '@/lib/adobe-sign/auth'

/** Maps Adobe Sign agreement statuses to provider-agnostic SignatureStatus. */
const STATUS_MAP: Record<string, SignatureStatus> = {
  SIGNED: 'signed',
  OUT_FOR_SIGNATURE: 'pending',
  OUT_FOR_APPROVAL: 'pending',
  APPROVED: 'pending',
  DELIVERED: 'pending',
  EXPIRED: 'expired',
  CANCELLED: 'rejected',
  RECALLED: 'rejected',
  ABORTED: 'rejected',
}

export class AdobeSignProvider implements ContractSigningProvider {
  readonly name = 'Adobe Sign'

  private async requireSession(): Promise<AdobeSignSession> {
    const session = await getAdobeSignSession()
    if (!session) {
      throw new Error(
        'Adobe Sign session not connected. Please connect via OAuth first.',
      )
    }
    return session
  }

  async sendForSigning(params: {
    pdf: Buffer
    filename: string
    signerEmail: string
    agreementName: string
    message?: string
  }): Promise<SendForSigningResult> {
    const session = await this.requireSession()

    const transientDoc = await uploadTransientDocument(
      session,
      params.pdf,
      params.filename,
    )
    if (!transientDoc?.transientDocumentId) {
      throw new Error('Provider returned no transient document ID')
    }

    const agreement = await createAgreement(session, {
      name: params.agreementName,
      participantEmail: params.signerEmail,
      message: params.message,
      fileInfos: [{ transientDocumentId: transientDoc.transientDocumentId }],
    })
    if (!agreement?.id) {
      throw new Error('Provider returned no agreement ID')
    }

    let signingUrl: string | undefined
    try {
      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await new Promise((r) => setTimeout(r, attempt * 2000))
          const urlInfo = await getSigningUrls(session, agreement.id)
          const signerUrl = urlInfo.signingUrls?.find(
            (u) => u.email === params.signerEmail,
          )
          if (signerUrl) {
            signingUrl = signerUrl.esignUrl
          }
          break
        } catch (retryError) {
          if (attempt === maxAttempts) throw retryError
        }
      }
    } catch (urlError) {
      console.warn(
        `[AdobeSignProvider] Failed to capture signing URL (non-fatal):`,
        urlError,
      )
    }

    return { agreementId: agreement.id, signingUrl }
  }

  async checkStatus(agreementId: string): Promise<SigningStatusResult> {
    const session = await this.requireSession()

    const agreement = await getAgreement(session, agreementId)
    if (!agreement?.status) {
      throw new Error('Provider returned no status for agreement')
    }

    const mapped = STATUS_MAP[agreement.status]
    if (!mapped) {
      console.warn(
        `[AdobeSignProvider] Unknown agreement status: ${agreement.status}`,
      )
    }

    return {
      status: mapped || 'pending',
      providerStatus: agreement.status,
    }
  }

  async cancelAgreement(agreementId: string): Promise<void> {
    const session = await this.requireSession()
    await adobeCancelAgreement(session, agreementId)
  }

  async sendReminder(agreementId: string): Promise<void> {
    const session = await this.requireSession()
    await adobeSendReminder(session, agreementId)
  }

  async getConnectionStatus(): Promise<SigningProviderStatus> {
    const session = await getAdobeSignSession()

    let webhookActive: string | null = null
    if (session) {
      try {
        const existing = await listWebhooks(session)
        const active = existing.userWebhookList?.find(
          (w) => w.state === 'ACTIVE',
        )
        if (active) {
          webhookActive = active.id
        }
      } catch {
        // Non-fatal — webhook check may fail if scope not granted
      }
    }

    return {
      connected: !!session,
      providerName: this.name,
      expiresAt: session?.expiresAt ?? null,
      detail: session?.apiAccessPoint ?? null,
      webhookActive,
    }
  }

  async getAuthorizeUrl(
    redirectUri: string,
  ): Promise<{ url: string; state: string }> {
    const state = crypto.randomUUID()
    const url = adobeGetAuthorizeUrl(state, redirectUri)
    return { url, state }
  }

  async disconnect(): Promise<void> {
    await clearAdobeSignSession()
  }

  async registerWebhook(
    webhookUrl: string,
  ): Promise<{ webhookId: string; existing: boolean }> {
    const session = await this.requireSession()

    const existing = await listWebhooks(session)
    const match = existing.userWebhookList?.find(
      (w) => w.webhookUrlInfo.url === webhookUrl && w.state === 'ACTIVE',
    )
    if (match) {
      return { webhookId: match.id, existing: true }
    }

    const result = await registerWebhook(session, {
      name: 'Cloud Native Days Sponsor Contracts',
      scope: 'ACCOUNT',
      state: 'ACTIVE',
      webhookSubscriptionEvents: [
        'AGREEMENT_WORKFLOW_COMPLETED',
        'AGREEMENT_RECALLED',
        'AGREEMENT_EXPIRED',
      ],
      webhookUrlInfo: { url: webhookUrl },
      webhookConditionalParams: {
        webhookAgreementEvents: {
          includeSignedDocuments: true,
        },
      },
    })

    return { webhookId: result.id, existing: false }
  }
}
