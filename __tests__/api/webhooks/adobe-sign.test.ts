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
import { NextRequest } from 'next/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockSanityFetch = jest.fn<(...args: any[]) => any>()
const mockPatch = jest.fn<(...args: any[]) => any>()
const mockSet = jest.fn<(...args: any[]) => any>()
const mockCommit = jest.fn<(...args: any[]) => any>()
const mockCreate = jest.fn<(...args: any[]) => any>()
const mockUpload = jest.fn<(...args: any[]) => any>()

jest.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => mockSanityFetch(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    assets: { upload: (...args: unknown[]) => mockUpload(...args) },
  },
}))

jest.mock('@/lib/time', () => ({
  getCurrentDateTime: () => '2026-01-15T10:00:00Z',
}))

jest.mock('@/lib/adobe-sign', () => ({}))

describe('api/webhooks/adobe-sign', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ADOBE_SIGN_CLIENT_ID = 'test-client-id'

    mockPatch.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ commit: mockCommit })
    mockCommit.mockResolvedValue({})
    mockCreate.mockResolvedValue({})
  })

  afterEach(() => {
    delete process.env.ADOBE_SIGN_CLIENT_ID
  })

  describe('GET - Webhook URL Verification', () => {
    function getRequest(clientId?: string): NextRequest {
      return new NextRequest('http://localhost:3000/api/webhooks/adobe-sign', {
        headers: clientId ? { 'X-AdobeSign-ClientId': clientId } : {},
      })
    }

    it('echoes client ID in header and JSON body on valid request', async () => {
      const { GET } = await import('@/app/api/webhooks/adobe-sign/route')

      const response = await GET(getRequest('test-client-id'))

      expect(response.status).toBe(200)
      expect(response.headers.get('X-AdobeSign-ClientId')).toBe(
        'test-client-id',
      )
      const data = await response.json()
      expect(data.xAdobeSignClientId).toBe('test-client-id')
    })

    it('returns 401 when X-AdobeSign-ClientId header is missing', async () => {
      const { GET } = await import('@/app/api/webhooks/adobe-sign/route')

      const response = await GET(getRequest())
      expect(response.status).toBe(401)
    })

    it('returns 401 when client ID does not match expected', async () => {
      const { GET } = await import('@/app/api/webhooks/adobe-sign/route')

      const response = await GET(getRequest('wrong-client-id'))
      expect(response.status).toBe(401)
    })
  })

  describe('POST - Event Processing', () => {
    function postRequest(
      body: Record<string, unknown>,
      clientId?: string,
    ): NextRequest {
      return new NextRequest('http://localhost:3000/api/webhooks/adobe-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clientId && { 'X-AdobeSign-ClientId': clientId }),
        },
        body: JSON.stringify(body),
      })
    }

    it('rejects requests without client ID header', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      const request = postRequest({ event: 'TEST' })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('rejects requests with wrong client ID', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      const request = postRequest({ event: 'TEST' }, 'wrong-id')
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('echoes client ID for events without agreement data', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      const request = postRequest(
        { webhookId: 'wh-1', event: 'SOME_EVENT' },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('X-AdobeSign-ClientId')).toBe(
        'test-client-id',
      )
      const data = await response.json()
      expect(data.xAdobeSignClientId).toBe('test-client-id')
    })

    it('handles AGREEMENT_WORKFLOW_COMPLETED with inline signed document', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce({
        _id: 'sfc-1',
        signatureStatus: 'pending',
      })
      mockUpload.mockResolvedValueOnce({ _id: 'file-asset-1' })

      const pdfBase64 = Buffer.from('fake-pdf-content').toString('base64')
      const request = postRequest(
        {
          event: 'AGREEMENT_WORKFLOW_COMPLETED',
          agreement: {
            id: 'agr-123',
            signedDocumentInfo: {
              document: pdfBase64,
              mimeType: 'application/pdf',
              name: 'contract.pdf',
            },
          },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSanityFetch).toHaveBeenCalledWith(
        expect.stringContaining('signatureId == $agreementId'),
        { agreementId: 'agr-123' },
      )
      expect(mockUpload).toHaveBeenCalledWith(
        'file',
        expect.any(Buffer),
        expect.objectContaining({
          filename: 'contract.pdf',
          contentType: 'application/pdf',
        }),
      )
      expect(mockPatch).toHaveBeenCalledWith('sfc-1')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureStatus: 'signed',
          contractStatus: 'contract-signed',
          contractSignedAt: '2026-01-15T10:00:00Z',
          contractDocument: {
            _type: 'file',
            asset: { _type: 'reference', _ref: 'file-asset-1' },
          },
        }),
      )
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          _type: 'sponsorActivity',
          activityType: 'signature_status_change',
        }),
      )
    })

    it('updates status without document when signedDocumentInfo is missing', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce({
        _id: 'sfc-1',
        signatureStatus: 'pending',
      })

      const request = postRequest(
        {
          event: 'AGREEMENT_WORKFLOW_COMPLETED',
          agreement: { id: 'agr-456' },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockPatch).toHaveBeenCalledWith('sfc-1')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureStatus: 'signed',
          contractStatus: 'contract-signed',
        }),
      )
      // contractDocument should not be in the set call
      const setArg = mockSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.contractDocument).toBeUndefined()
    })

    it('handles conditionalParametersTrimmed when document exceeds payload size', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce({
        _id: 'sfc-1',
        signatureStatus: 'pending',
      })

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const request = postRequest(
        {
          event: 'AGREEMENT_WORKFLOW_COMPLETED',
          agreement: { id: 'agr-trimmed' },
          conditionalParametersTrimmed: ['agreement.signedDocumentInfo'],
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockPatch).toHaveBeenCalledWith('sfc-1')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureStatus: 'signed',
          contractStatus: 'contract-signed',
        }),
      )
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('trimmed from payload'),
        'agr-trimmed',
      )
      expect(mockUpload).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('handles AGREEMENT_RECALLED as rejected', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce({
        _id: 'sfc-2',
        signatureStatus: 'pending',
      })

      const request = postRequest(
        {
          event: 'AGREEMENT_RECALLED',
          agreement: { id: 'agr-789' },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSet).toHaveBeenCalledWith({ signatureStatus: 'rejected' })
    })

    it('handles AGREEMENT_EXPIRED as expired', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce({
        _id: 'sfc-3',
        signatureStatus: 'pending',
      })

      const request = postRequest(
        {
          event: 'AGREEMENT_EXPIRED',
          agreement: { id: 'agr-expired' },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSet).toHaveBeenCalledWith({ signatureStatus: 'expired' })
    })

    it('ignores agreement events when sponsor not found', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockResolvedValueOnce(null)

      const request = postRequest(
        {
          event: 'AGREEMENT_WORKFLOW_COMPLETED',
          agreement: { id: 'agr-unknown' },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockPatch).not.toHaveBeenCalled()
    })

    it('returns 500 on internal processing error', async () => {
      const { POST } = await import('@/app/api/webhooks/adobe-sign/route')

      mockSanityFetch.mockRejectedValueOnce(new Error('Sanity down'))

      const request = postRequest(
        {
          event: 'AGREEMENT_WORKFLOW_COMPLETED',
          agreement: { id: 'agr-err' },
        },
        'test-client-id',
      )
      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })
})
