/**
 * @vitest-environment node
 */
import type { MockedFunction } from 'vitest'
import type { AdobeSignSession } from '@/lib/adobe-sign/auth'

const mockFetch = vi.fn() as MockedFunction<typeof global.fetch>
let savedFetch: typeof global.fetch

const testSession: AdobeSignSession = {
  accessToken: 'test-token-123',
  refreshToken: 'test-refresh-token',
  apiAccessPoint: 'https://api.test.adobesign.com/',
  expiresAt: Date.now() + 3600_000,
}

describe('Adobe Sign client', () => {
  beforeEach(() => {
    vi.resetModules()
    savedFetch = global.fetch
    global.fetch = mockFetch
    mockFetch.mockReset()
  })

  afterEach(() => {
    global.fetch = savedFetch
  })

  describe('createAgreement', () => {
    it('sends correct payload to the agreements endpoint', async () => {
      const { createAgreement } = await import('@/lib/adobe-sign/client')

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'agr-abc' }), { status: 200 }),
      )

      const result = await createAgreement(testSession, {
        name: 'Sponsorship Agreement',
        participantEmail: 'sponsor@corp.com',
        message: 'Please sign',
        fileInfos: [{ transientDocumentId: 'td-123' }],
      })

      expect(result.id).toBe('agr-abc')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const apiCall = mockFetch.mock.calls[0]
      expect(apiCall[0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements',
      )
      const init = apiCall[1] as RequestInit
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-token-123',
      })
      const body = JSON.parse(init.body as string)
      expect(body.participantSetsInfo[0].memberInfos[0].email).toBe(
        'sponsor@corp.com',
      )
      expect(body.signatureType).toBe('ESIGN')
      expect(body.message).toBe('Please sign')
    })
  })

  describe('getAgreement', () => {
    it('fetches agreement details', async () => {
      const { getAgreement } = await import('@/lib/adobe-sign/client')

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

      const result = await getAgreement(testSession, 'agr-abc')
      expect(result.status).toBe('OUT_FOR_SIGNATURE')
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc',
      )
    })
  })

  describe('sendReminder', () => {
    it('sends a reminder for an agreement', async () => {
      const { sendReminder } = await import('@/lib/adobe-sign/client')

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'reminder-1', status: 'ACTIVE' }), {
          status: 200,
        }),
      )

      const result = await sendReminder(testSession, 'agr-abc')
      expect(result.id).toBe('reminder-1')
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc/reminders',
      )
    })
  })

  describe('cancelAgreement', () => {
    it('sends cancel state to agreements endpoint', async () => {
      const { cancelAgreement } = await import('@/lib/adobe-sign/client')

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      )

      await cancelAgreement(testSession, 'agr-abc')

      const apiCall = mockFetch.mock.calls[0]
      expect(apiCall[0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/agreements/agr-abc/state',
      )
      const body = JSON.parse((apiCall[1] as RequestInit).body as string)
      expect(body.state).toBe('CANCELLED')
    })
  })

  describe('uploadTransientDocument', () => {
    it('uploads a PDF buffer', async () => {
      const { uploadTransientDocument } =
        await import('@/lib/adobe-sign/client')

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ transientDocumentId: 'td-999' }), {
          status: 200,
        }),
      )

      const pdf = Buffer.from('fake-pdf-content')
      const result = await uploadTransientDocument(
        testSession,
        pdf,
        'contract.pdf',
      )

      expect(result.transientDocumentId).toBe('td-999')
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.test.adobesign.com/api/rest/v6/transientDocuments',
      )
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-token-123',
      })
    })
  })

  describe('error handling', () => {
    it('throws on API request failure', async () => {
      const { getAgreement } = await import('@/lib/adobe-sign/client')

      mockFetch.mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      )

      await expect(getAgreement(testSession, 'agr-missing')).rejects.toThrow(
        'Adobe Sign API error 404',
      )
    })
  })
})
