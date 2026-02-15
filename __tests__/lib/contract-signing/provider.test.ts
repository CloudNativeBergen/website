/**
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { ContractSigningProvider } from '@/lib/contract-signing/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockUploadTransientDocument = jest.fn<(...args: any[]) => any>()
const mockCreateAgreement = jest.fn<(...args: any[]) => any>()
const mockGetAgreement = jest.fn<(...args: any[]) => any>()
const mockGetSigningUrls = jest.fn<(...args: any[]) => any>()
const mockCancelAgreement = jest.fn<(...args: any[]) => any>()
const mockSendReminder = jest.fn<(...args: any[]) => any>()
const mockListWebhooks = jest.fn<(...args: any[]) => any>()
const mockRegisterWebhook = jest.fn<(...args: any[]) => any>()
const mockGetAdobeSignSession = jest.fn<(...args: any[]) => any>()
const mockClearAdobeSignSession = jest.fn<(...args: any[]) => any>()
const mockGetAuthorizeUrl = jest.fn<(...args: any[]) => any>()

jest.mock('@/lib/adobe-sign/client', () => ({
  uploadTransientDocument: (...args: unknown[]) =>
    mockUploadTransientDocument(...args),
  createAgreement: (...args: unknown[]) => mockCreateAgreement(...args),
  getAgreement: (...args: unknown[]) => mockGetAgreement(...args),
  getSigningUrls: (...args: unknown[]) => mockGetSigningUrls(...args),
  cancelAgreement: (...args: unknown[]) => mockCancelAgreement(...args),
  sendReminder: (...args: unknown[]) => mockSendReminder(...args),
  listWebhooks: (...args: unknown[]) => mockListWebhooks(...args),
  registerWebhook: (...args: unknown[]) => mockRegisterWebhook(...args),
}))

jest.mock('@/lib/adobe-sign/auth', () => ({
  getAdobeSignSession: (...args: unknown[]) => mockGetAdobeSignSession(...args),
  clearAdobeSignSession: (...args: unknown[]) =>
    mockClearAdobeSignSession(...args),
  getAuthorizeUrl: (...args: unknown[]) => mockGetAuthorizeUrl(...args),
}))

const testSession = {
  accessToken: 'test-token',
  refreshToken: 'test-refresh',
  apiAccessPoint: 'https://api.test.adobesign.com/',
  expiresAt: Date.now() + 3600_000,
}

describe('AdobeSignProvider', () => {
  let provider: ContractSigningProvider

  beforeEach(async () => {
    jest.clearAllMocks()
    mockGetAdobeSignSession.mockResolvedValue(testSession)
    const { AdobeSignProvider } =
      await import('@/lib/contract-signing/adobe-sign')
    provider = new AdobeSignProvider()
  })

  it('has name "Adobe Sign"', () => {
    expect(provider.name).toBe('Adobe Sign')
  })

  describe('sendForSigning', () => {
    it('uploads document, creates agreement, and returns ID + signing URL', async () => {
      jest.useFakeTimers()
      mockUploadTransientDocument.mockResolvedValue({
        transientDocumentId: 'td-123',
      })
      mockCreateAgreement.mockResolvedValue({ id: 'agr-abc' })
      mockGetSigningUrls.mockResolvedValue({
        signingUrls: [
          { email: 'signer@test.com', esignUrl: 'https://sign.example.com' },
        ],
      })

      const promise = provider.sendForSigning({
        pdf: Buffer.from('fake-pdf'),
        filename: 'contract.pdf',
        signerEmail: 'signer@test.com',
        agreementName: 'Test Agreement',
        message: 'Please sign',
      })

      // Advance through the first retry delay
      await jest.advanceTimersByTimeAsync(10_000)

      const result = await promise

      expect(result.agreementId).toBe('agr-abc')
      expect(result.signingUrl).toBe('https://sign.example.com')
      expect(mockUploadTransientDocument).toHaveBeenCalledWith(
        testSession,
        expect.any(Buffer),
        'contract.pdf',
      )
      expect(mockCreateAgreement).toHaveBeenCalledWith(testSession, {
        name: 'Test Agreement',
        participantEmail: 'signer@test.com',
        message: 'Please sign',
        fileInfos: [{ transientDocumentId: 'td-123' }],
      })
      jest.useRealTimers()
    })

    it('throws when session is not connected', async () => {
      mockGetAdobeSignSession.mockResolvedValue(null)

      await expect(
        provider.sendForSigning({
          pdf: Buffer.from('pdf'),
          filename: 'test.pdf',
          signerEmail: 'test@test.com',
          agreementName: 'Test',
        }),
      ).rejects.toThrow(/not connected/i)
    })

    it('throws when transient document upload returns no ID', async () => {
      mockUploadTransientDocument.mockResolvedValue({})

      await expect(
        provider.sendForSigning({
          pdf: Buffer.from('pdf'),
          filename: 'test.pdf',
          signerEmail: 'test@test.com',
          agreementName: 'Test',
        }),
      ).rejects.toThrow(/no transient document/i)
    })

    it('throws when agreement creation returns no ID', async () => {
      mockUploadTransientDocument.mockResolvedValue({
        transientDocumentId: 'td-1',
      })
      mockCreateAgreement.mockResolvedValue({})

      await expect(
        provider.sendForSigning({
          pdf: Buffer.from('pdf'),
          filename: 'test.pdf',
          signerEmail: 'test@test.com',
          agreementName: 'Test',
        }),
      ).rejects.toThrow(/no agreement/i)
    })

    it('returns without signing URL when getSigningUrls fails', async () => {
      jest.useFakeTimers()
      mockUploadTransientDocument.mockResolvedValue({
        transientDocumentId: 'td-1',
      })
      mockCreateAgreement.mockResolvedValue({ id: 'agr-1' })
      mockGetSigningUrls.mockRejectedValue(new Error('timeout'))

      const promise = provider.sendForSigning({
        pdf: Buffer.from('pdf'),
        filename: 'test.pdf',
        signerEmail: 'test@test.com',
        agreementName: 'Test',
      })

      // Advance through the retry delays (2s, 4s, 6s)
      for (let i = 0; i < 3; i++) {
        await jest.advanceTimersByTimeAsync(10_000)
      }

      const result = await promise

      expect(result.agreementId).toBe('agr-1')
      expect(result.signingUrl).toBeUndefined()
      jest.useRealTimers()
    })
  })

  describe('checkStatus', () => {
    it('maps SIGNED to "signed"', async () => {
      mockGetAgreement.mockResolvedValue({ status: 'SIGNED' })
      const result = await provider.checkStatus('agr-1')
      expect(result.status).toBe('signed')
      expect(result.providerStatus).toBe('SIGNED')
    })

    it('maps OUT_FOR_SIGNATURE to "pending"', async () => {
      mockGetAgreement.mockResolvedValue({ status: 'OUT_FOR_SIGNATURE' })
      const result = await provider.checkStatus('agr-1')
      expect(result.status).toBe('pending')
    })

    it('maps CANCELLED to "rejected"', async () => {
      mockGetAgreement.mockResolvedValue({ status: 'CANCELLED' })
      const result = await provider.checkStatus('agr-1')
      expect(result.status).toBe('rejected')
    })

    it('maps EXPIRED to "expired"', async () => {
      mockGetAgreement.mockResolvedValue({ status: 'EXPIRED' })
      const result = await provider.checkStatus('agr-1')
      expect(result.status).toBe('expired')
    })

    it('defaults to "pending" for unknown statuses', async () => {
      mockGetAgreement.mockResolvedValue({ status: 'SOME_NEW_STATUS' })
      const result = await provider.checkStatus('agr-1')
      expect(result.status).toBe('pending')
      expect(result.providerStatus).toBe('SOME_NEW_STATUS')
    })

    it('throws when no status returned', async () => {
      mockGetAgreement.mockResolvedValue({})
      await expect(provider.checkStatus('agr-1')).rejects.toThrow(/no status/i)
    })
  })

  describe('cancelAgreement', () => {
    it('delegates to adobe-sign client', async () => {
      mockCancelAgreement.mockResolvedValue(undefined)
      await provider.cancelAgreement('agr-1')
      expect(mockCancelAgreement).toHaveBeenCalledWith(testSession, 'agr-1')
    })
  })

  describe('sendReminder', () => {
    it('delegates to adobe-sign client', async () => {
      mockSendReminder.mockResolvedValue({ id: 'reminder-1' })
      await provider.sendReminder('agr-1')
      expect(mockSendReminder).toHaveBeenCalledWith(testSession, 'agr-1')
    })
  })

  describe('getConnectionStatus', () => {
    it('returns connected status with webhook info', async () => {
      mockListWebhooks.mockResolvedValue({
        userWebhookList: [
          { id: 'wh-1', state: 'ACTIVE', webhookUrlInfo: { url: 'x' } },
        ],
      })
      const status = await provider.getConnectionStatus()
      expect(status.connected).toBe(true)
      expect(status.providerName).toBe('Adobe Sign')
      expect(status.webhookActive).toBe('wh-1')
    })

    it('returns disconnected status when no session', async () => {
      mockGetAdobeSignSession.mockResolvedValue(null)
      const status = await provider.getConnectionStatus()
      expect(status.connected).toBe(false)
      expect(status.webhookActive).toBeNull()
    })
  })

  describe('getAuthorizeUrl', () => {
    it('returns URL and state from adobe-sign auth', async () => {
      mockGetAuthorizeUrl.mockReturnValue('https://sign.example.com/auth')
      const result = await provider.getAuthorizeUrl(
        'https://example.com/callback',
      )
      expect(result.url).toBe('https://sign.example.com/auth')
      expect(result.state).toBeDefined()
      expect(typeof result.state).toBe('string')
    })
  })

  describe('disconnect', () => {
    it('clears the session', async () => {
      mockClearAdobeSignSession.mockResolvedValue(undefined)
      await provider.disconnect()
      expect(mockClearAdobeSignSession).toHaveBeenCalled()
    })
  })

  describe('registerWebhook', () => {
    it('returns existing webhook if already active', async () => {
      mockListWebhooks.mockResolvedValue({
        userWebhookList: [
          {
            id: 'wh-1',
            state: 'ACTIVE',
            webhookUrlInfo: { url: 'https://example.com/webhook' },
          },
        ],
      })
      const result = await provider.registerWebhook(
        'https://example.com/webhook',
      )
      expect(result.webhookId).toBe('wh-1')
      expect(result.existing).toBe(true)
      expect(mockRegisterWebhook).not.toHaveBeenCalled()
    })

    it('registers new webhook if none exists', async () => {
      mockListWebhooks.mockResolvedValue({ userWebhookList: [] })
      mockRegisterWebhook.mockResolvedValue({ id: 'wh-new' })
      const result = await provider.registerWebhook(
        'https://example.com/webhook',
      )
      expect(result.webhookId).toBe('wh-new')
      expect(result.existing).toBe(false)
      expect(mockRegisterWebhook).toHaveBeenCalled()
    })
  })
})

describe('getSigningProvider', () => {
  it('returns SelfHostedSigningProvider by default', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider()
    expect(provider.name).toBe('Verified Document Signing')
  })

  it('returns AdobeSignProvider when explicitly requested', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider('adobe-sign')
    expect(provider.name).toBe('Adobe Sign')
  })

  it('implements ContractSigningProvider interface', async () => {
    const { getSigningProvider } = await import('@/lib/contract-signing')
    const provider = getSigningProvider()
    expect(typeof provider.sendForSigning).toBe('function')
    expect(typeof provider.checkStatus).toBe('function')
    expect(typeof provider.cancelAgreement).toBe('function')
    expect(typeof provider.sendReminder).toBe('function')
    expect(typeof provider.getConnectionStatus).toBe('function')
    expect(typeof provider.getAuthorizeUrl).toBe('function')
    expect(typeof provider.disconnect).toBe('function')
    expect(typeof provider.registerWebhook).toBe('function')
  })
})
