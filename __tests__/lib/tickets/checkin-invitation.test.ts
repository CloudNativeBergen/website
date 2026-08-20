/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CheckinProvider } from '@/lib/tickets/provider/checkin'

function provider() {
  return new CheckinProvider({
    apiUrl: 'https://api.checkin.test/graphql',
    apiKey: 'key',
    apiSecret: 'secret',
  })
}

function graphqlResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CheckinProvider.sendTicketInvitation', () => {
  it('sends a single-use TICKET invitation for the given emails', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { sendEventInvitation: { success: true } } }),
    )

    await expect(
      provider().sendTicketInvitation(777, ['ada@example.com'], 'Welcome!'),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables).toEqual({
      invites: [{ itemType: 'TICKET', id: 777, usageLimit: 1 }],
      emails: ['ada@example.com'],
      message: 'Welcome!',
    })
  })

  it('throws when Checkin answers success=false without GraphQL errors', async () => {
    // The silent-failure case: HTTP 200, no `errors` array, but the mutation
    // reports it did not send. Treating that as sent would leave the speaker
    // waiting forever for an invitation that never left Checkin.
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { sendEventInvitation: { success: false } } }),
    )

    await expect(
      provider().sendTicketInvitation(777, ['ada@example.com']),
    ).rejects.toThrow(/success=false/)
  })

  it('throws when the mutation payload is missing entirely', async () => {
    fetchMock.mockResolvedValue(graphqlResponse({ data: {} }))

    await expect(
      provider().sendTicketInvitation(777, ['ada@example.com']),
    ).rejects.toThrow(/Failed to send event invitation/)
  })

  it('wraps GraphQL errors in a send-invitation failure', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({ errors: [{ message: 'nope' }] }),
    )

    await expect(
      provider().sendTicketInvitation(777, ['ada@example.com']),
    ).rejects.toThrow(/Failed to send event invitation/)
  })
})
