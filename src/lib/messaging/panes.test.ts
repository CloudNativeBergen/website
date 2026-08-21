/**
 * The URL grammar of the three-pane messages surface.
 *
 * The load-bearing assertion here is that the THREAD step's URL is exactly
 * `/admin/messages/<conversationId>` — the string already persisted on
 * `notification` documents and matched by `link in $links` across the messaging,
 * notification and proposal data layers. If a refactor ever decorates that path
 * (a `/thread` suffix, a `?c=` param, a different base), these tests fail
 * BEFORE the stored links are orphaned in production.
 */
import { describe, expect, it } from 'vitest'
import { messagesPaneHref, messagesPaneStep } from './panes'
import { conversationEmailLinkPath, conversationLinkPath } from './links'

const CONV = 'conversation.abc123'
const PROPOSAL_CONV = 'conversation.proposal.talk-1'

describe('messagesPaneStep', () => {
  it('is the list when no conversation is selected', () => {
    expect(messagesPaneStep(undefined, null)).toBe('list')
    expect(messagesPaneStep(null, null)).toBe('list')
    expect(messagesPaneStep('', null)).toBe('list')
  })

  it('is the thread for a selected conversation with no pane param', () => {
    expect(messagesPaneStep(CONV, null)).toBe('thread')
    expect(messagesPaneStep(CONV, undefined)).toBe('thread')
  })

  it('is the proposal step only for `?pane=proposal`', () => {
    expect(messagesPaneStep(CONV, 'proposal')).toBe('proposal')
  })

  it('degrades an unknown or stale pane param to the thread', () => {
    expect(messagesPaneStep(CONV, 'nonsense')).toBe('thread')
    expect(messagesPaneStep(CONV, 'PROPOSAL')).toBe('thread')
  })

  it('degrades `?pane=proposal` with nothing selected to the list', () => {
    expect(messagesPaneStep(undefined, 'proposal')).toBe('list')
  })
})

describe('messagesPaneHref', () => {
  it('builds the bare inbox for the list step', () => {
    expect(
      messagesPaneHref({ basePath: '/admin/messages', pane: 'list' }),
    ).toBe('/admin/messages')
  })

  it('builds exactly the stored notification link for the thread step', () => {
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
      }),
    ).toBe(`/admin/messages/${CONV}`)
  })

  it('adds `?pane=proposal` — and only that — for the proposal step', () => {
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: PROPOSAL_CONV,
        pane: 'proposal',
      }),
    ).toBe(`/admin/messages/${PROPOSAL_CONV}?pane=proposal`)
  })

  it('preserves the inbox `?view=` tab across every step', () => {
    const search = 'view=needs-reply'
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
        search,
      }),
    ).toBe(`/admin/messages/${CONV}?view=needs-reply`)
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'proposal',
        search,
      }),
    ).toBe(`/admin/messages/${CONV}?view=needs-reply&pane=proposal`)
    expect(
      messagesPaneHref({ basePath: '/admin/messages', pane: 'list', search }),
    ).toBe('/admin/messages?view=needs-reply')
  })

  it('accepts a leading `?` on the incoming search string', () => {
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
        search: '?view=mine',
      }),
    ).toBe(`/admin/messages/${CONV}?view=mine`)
  })

  it('drops a stale `pane` when walking back out to the thread or the list', () => {
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
        search: 'pane=proposal',
      }),
    ).toBe(`/admin/messages/${CONV}`)
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        pane: 'list',
        search: 'pane=proposal&view=mine',
      }),
    ).toBe('/admin/messages?view=mine')
  })

  it('falls back to the list when a thread step has no conversation', () => {
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: undefined,
        pane: 'thread',
      }),
    ).toBe('/admin/messages')
  })

  it('serves the speaker base path unchanged', () => {
    expect(
      messagesPaneHref({
        basePath: '/cfp/messages',
        conversationId: CONV,
        pane: 'thread',
      }),
    ).toBe(`/cfp/messages/${CONV}`)
  })
})

describe('the /admin/messages/<id> URL contract', () => {
  it('matches the organizer EMAIL link contract byte for byte', () => {
    // `conversationEmailLinkPath` is what goes into the message emails AND
    // (for general/sponsor threads) onto notification documents. The workspace
    // must land on that exact URL, not a variant of it.
    const stored = conversationEmailLinkPath({ _id: CONV }, true)
    expect(stored).toBe(`/admin/messages/${CONV}`)
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
      }),
    ).toBe(stored)
  })

  it('matches the organizer HUB link for a general thread', () => {
    const stored = conversationLinkPath(
      { _id: CONV, conversationType: 'general' },
      true,
    )
    expect(stored).toBe(`/admin/messages/${CONV}`)
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: CONV,
        pane: 'thread',
      }),
    ).toBe(stored)
  })

  it('matches the organizer HUB link for a sponsor thread', () => {
    const sponsorId = 'conversation.sponsor.sfc-1'
    const stored = conversationLinkPath(
      { _id: sponsorId, conversationType: 'sponsor' },
      true,
    )
    expect(stored).toBe(`/admin/messages/${sponsorId}`)
    expect(
      messagesPaneHref({
        basePath: '/admin/messages',
        conversationId: sponsorId,
        pane: 'thread',
      }),
    ).toBe(stored)
  })

  it('leaves the PROPOSAL hub link pointing at the proposal page', () => {
    // Unchanged on purpose: this is the string on historical notification
    // documents. The workspace changes where a LIST ROW goes, never what the
    // hub/notification contract emits.
    expect(
      conversationLinkPath(
        {
          _id: PROPOSAL_CONV,
          conversationType: 'proposal',
          proposalId: 'talk-1',
        },
        true,
      ),
    ).toBe('/admin/proposals/talk-1#messages')
  })
})
