/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'

process.env.INVITATION_TOKEN_SECRET ||= 'test-secret'

const send = vi.fn<(payload: unknown) => Promise<unknown>>(async () => ({
  data: { id: 'e1' },
  error: null,
}))
vi.mock('@/lib/email/config', () => ({
  resolveEmailSender: async () => ({ client: { emails: { send } } }),
  retryWithBackoff: <T>(fn: () => Promise<T>) => fn(),
}))
vi.mock('@/lib/environment', () => ({ AppEnvironment: { isTestMode: false } }))
vi.mock('@/lib/sanity/client', () => ({ clientWrite: {} }))
vi.mock('./sanity', () => ({ getProposalAbstract: async () => null }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

import { sendInvitationEmail } from './server'
import type { CoSpeakerInvitationFull } from './types'

describe('sendInvitationEmail', () => {
  it('links to the conference domain, not the request host', async () => {
    const ok = await sendInvitationEmail(
      {
        _id: 'inv-1',
        token: 'tok',
        invitedEmail: 'bob@example.com',
        expiresAt: '2026-12-01T00:00:00Z',
        proposal: { _id: 'p1', title: 'Talk' },
        invitedBy: { name: 'Ada', email: 'ada@example.com' },
      } as unknown as CoSpeakerInvitationFull,
      'invitation',
      {
        conference: {
          _id: 'c1',
          title: 'Conf',
          domains: ['conf.example'],
          cfpEmail: 'cfp@conf.example',
        } as never,
        domain: 'admin.internal',
      },
    )

    expect(ok).toBe(true)
    const react = (send.mock.calls[0][0] as { react: { props: object } }).react
    expect(react.props).toMatchObject({
      invitationUrl: 'https://conf.example/invitation/respond?token=tok',
    })
  })
})
