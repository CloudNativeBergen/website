/**
 * @jest-environment node
 */
import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'

const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>
let savedFetch: typeof global.fetch

describe('Adobe Sign client', () => {
  beforeEach(() => {
    jest.resetModules()
    savedFetch = global.fetch
    global.fetch = mockFetch
    mockFetch.mockReset()

    process.env.ADOBE_SIGN_APPLICATION_ID = 'test-application-id'
    process.env.ADOBE_SIGN_APPLICATION_SECRET = 'test-application-secret'
    process.env.ADOBE_SIGN_BASE_URL =
      'https://api.test.adobesign.com/api/rest/v6'
  })

  afterEach(() => {
    global.fetch = savedFetch
    delete process.env.ADOBE_SIGN_APPLICATION_ID
    delete process.env.ADOBE_SIGN_APPLICATION_SECRET
    delete process.env.ADOBE_SIGN_BASE_URL
  })

  function mockTokenResponse() {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'test-token-123',
          token_type: 'bearer',
          expires_in: 86400,
        }),
        { status: 200 },
      ),
    )
  }

  describe('getAccessToken (via createAgreement)', () => {
    it('fetches a token and caches it', async () => {
      const { clearTokenCache, createAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'agreement-1' }), { status: 200 }),
      )

      await createAgreement({
        name: 'Test Agreement',
        participantEmail: 'signer@example.com',
        fileInfos: [{ transientDocumentId: 'doc-123' }],
      })

      // Token call + API call
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://ims-na1.adobelogin.com/ims/token/v3',
      )

      // Second call should reuse cached token
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'agreement-2' }), { status: 200 }),
      )

      await createAgreement({
        name: 'Test Agreement 2',
        participantEmail: 'signer2@example.com',
        fileInfos: [{ transientDocumentId: 'doc-456' }],
      })

      // Only 1 more call (API), no new token call
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('throws when credentials are missing', async () => {
      delete process.env.ADOBE_SIGN_APPLICATION_ID
      const { clearTokenCache, createAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      await expect(
        createAgreement({
          name: 'Test',
          participantEmail: 'test@example.com',
          fileInfos: [{ transientDocumentId: 'doc' }],
        }),
      ).rejects.toThrow('Adobe Sign credentials not configured')
    })
  })

  describe('createAgreement', () => {
    it('sends correct payload to the agreements endpoint', async () => {
      const { clearTokenCache, createAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'agr-abc' }), { status: 200 }),
      )

      const result = await createAgreement({
        name: 'Sponsorship Agreement',
        participantEmail: 'sponsor@corp.com',
        message: 'Please sign',
        fileInfos: [{ transientDocumentId: 'td-123' }],
      })

      expect(result.id).toBe('agr-abc')

      const apiCall = mockFetch.mock.calls[1]
      expect(apiCall[0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements',
      )
      const body = JSON.parse((apiCall[1] as RequestInit).body as string)
      expect(body.participantSetsInfo[0].memberInfos[0].email).toBe(
        'sponsor@corp.com',
      )
      expect(body.signatureType).toBe('ESIGN')
      expect(body.message).toBe('Please sign')
    })
  })

  describe('getAgreement', () => {
    it('fetches agreement details', async () => {
      const { clearTokenCache, getAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'agr-abc',
            name: 'Test',
            status: 'OUT_FOR_SIGNATURE',
            createdDate: '2026-01-01T00:00:00Z',
          }),
          { status: 200 },
        ),
      )

      const result = await getAgreement('agr-abc')
      expect(result.status).toBe('OUT_FOR_SIGNATURE')
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc',
      )
    })
  })

  describe('sendReminder', () => {
    it('sends a reminder for an agreement', async () => {
      const { clearTokenCache, sendReminder } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'reminder-1', status: 'ACTIVE' }), {
          status: 200,
        }),
      )

      const result = await sendReminder('agr-abc')
      expect(result.id).toBe('reminder-1')
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc/reminders',
      )
    })
  })

  describe('cancelAgreement', () => {
    it('sends cancel state to agreements endpoint', async () => {
      const { clearTokenCache, cancelAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )

      await cancelAgreement('agr-abc')

      const apiCall = mockFetch.mock.calls[1]
      expect(apiCall[0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc/state',
      )
      const body = JSON.parse((apiCall[1] as RequestInit).body as string)
      expect(body.state).toBe('CANCELLED')
    })
  })

  describe('uploadTransientDocument', () => {
    it('uploads a PDF buffer', async () => {
      const { clearTokenCache, uploadTransientDocument } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ transientDocumentId: 'td-999' }), {
          status: 200,
        }),
      )

      const pdf = Buffer.from('fake-pdf-content')
      const result = await uploadTransientDocument(pdf, 'contract.pdf')

      expect(result.transientDocumentId).toBe('td-999')
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/transientDocuments',
      )
    })
  })

  describe('downloadSignedDocument', () => {
    it('downloads the combined document for an agreement', async () => {
      const { clearTokenCache, downloadSignedDocument } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      const pdfContent = new Uint8Array([37, 80, 68, 70]) // %PDF
      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(new Response(pdfContent, { status: 200 }))

      const result = await downloadSignedDocument('agr-signed')

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(new Uint8Array(result)[0]).toBe(37)
      expect(mockFetch.mock.calls[1][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-signed/combinedDocument',
      )
    })

    it('throws on download failure', async () => {
      const { clearTokenCache, downloadSignedDocument } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      )

      await expect(downloadSignedDocument('agr-missing')).rejects.toThrow(
        'Adobe Sign download failed (404)',
      )
    })
  })

  describe('error handling', () => {
    it('throws on token request failure', async () => {
      const { clearTokenCache, getAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      )

      await expect(getAgreement('agr-123')).rejects.toThrow(
        'Adobe Sign token request failed (401)',
      )
    })

    it('throws on API request failure', async () => {
      const { clearTokenCache, getAgreement } =
        await import('@/lib/adobe-sign/client')
      clearTokenCache()

      mockTokenResponse()
      mockFetch.mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      )

      await expect(getAgreement('agr-missing')).rejects.toThrow(
        'Adobe Sign API error 404',
      )
    })
  })
})
