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

  it('sends an Idempotency-Key header on the mutation', async () => {
    // Checkin rejects a mutation without this header outright — the production
    // break this test exists to keep from coming back.
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { sendEventInvitation: { success: true } } }),
    )

    await provider().sendTicketInvitation(777, ['ada@example.com'])

    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('uses a DIFFERENT key for each invitation', async () => {
    // The sweep invites speakers in a loop. A shared key would make Checkin
    // treat every invitation after the first as a duplicate of the first and
    // drop it — silently, with success=true.
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { sendEventInvitation: { success: true } } }),
    )

    const p = provider()
    await p.sendTicketInvitation(777, ['ada@example.com'])
    await p.sendTicketInvitation(777, ['grace@example.com'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [first, second] = fetchMock.mock.calls.map(
      (call) => call[1].headers['Idempotency-Key'],
    )
    expect(first).toBeTruthy()
    expect(second).not.toBe(first)
  })

  it('sends no Idempotency-Key on a query', async () => {
    // Reads never mutate, and have been working without the header; do not
    // start sending one and risk trading this 400 for another.
    fetchMock.mockResolvedValue(
      graphqlResponse({ data: { findEventById: null } }),
    )

    await provider()
      .fetchPublicTicketTypes(777)
      .catch(() => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      'Idempotency-Key',
    )
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
