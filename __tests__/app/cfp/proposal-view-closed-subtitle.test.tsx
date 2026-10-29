/**
 * @vitest-environment node
 *
 * After the conference, the proposal page is read-only. Its subtitle only
 * promises slide uploads when the attachments panel is actually shown, which
 * is for accepted and confirmed talks.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const getProposalMock = vi.fn()

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-url': 'https://conf/cfp' })),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('unexpected notFound')
  }),
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', email: 'ada@example.com' },
  })),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: vi.fn(async () => false),
  resolveCurrentOrgId: vi.fn(async () => null),
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposalSanity: (...args: unknown[]) => getProposalMock(...args),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', name: 'Ada' },
    err: null,
  })),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: { _id: 'conf-1', endDate: '2020-01-01' },
  })),
}))
vi.mock('@/lib/messaging/sanity', () => ({
  getUnreadCountsByProposalIds: vi.fn(async () => ({})),
}))
vi.mock('@/lib/feedback', () => ({ ATTENDEE_PAGE_LIVE: false }))
vi.mock('@/components/cfp/ProposalReadOnlyView', () => ({
  ProposalReadOnlyView: () => null,
}))
vi.mock('@/components/cfp/ProposalForm', () => ({ ProposalForm: () => null }))
vi.mock('@/components/cfp/ProposalGuidanceSidebar', () => ({
  ProposalGuidanceSidebar: () => null,
}))
vi.mock('@/components/cfp/PostConferenceVideoPanel', () => ({
  PostConferenceVideoPanel: () => null,
}))
vi.mock('@/components/proposal/ProposalAttachmentsPanel', () => ({
  ProposalAttachmentsPanel: () => null,
}))
vi.mock('@/components/feedback', () => ({ SessionFeedbackSection: () => null }))
vi.mock('@/components/messaging', () => ({
  ProposalMessagesSection: () => null,
}))
vi.mock('@/components/BackButton', () => ({ BackLink: () => null }))

import ProposalViewPage from '@/app/(cfp)/cfp/proposal/[id]/page'

async function renderFor(status: string): Promise<string> {
  getProposalMock.mockResolvedValue({
    proposal: {
      _id: 'p-1',
      title: 'Talk',
      status,
      conference: { _id: 'conf-1' },
      speakers: [],
    },
    proposalError: null,
  })
  const element = (await ProposalViewPage({
    params: Promise.resolve({ id: 'p-1' }),
  })) as ReactElement
  return renderToStaticMarkup(element)
}

describe('read-only proposal subtitle after the conference', () => {
  it('offers slide uploads for a confirmed talk', async () => {
    const html = await renderFor('confirmed')
    expect(html).toContain('can no longer be edited')
    expect(html).toContain('You can still upload slides.')
  })

  it.each(['rejected', 'withdrawn'])(
    'does not offer slide uploads for a %s talk',
    async (status) => {
      const html = await renderFor(status)
      expect(html).toContain('can no longer be edited')
      expect(html).not.toContain('upload slides')
    },
  )
})
