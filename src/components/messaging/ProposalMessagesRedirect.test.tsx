/**
 * @vitest-environment jsdom
 *
 * The legacy `#messages` deep link, and the reopen loop it used to cause.
 *
 * `conversationLinkPath()` still points organizer proposal-thread notifications
 * at `/admin/proposals/<id>#messages`, and those strings are already persisted
 * in Sanity, so arriving with that fragment must land somewhere correct.
 *
 * The component this replaces answered the fragment by writing a query param to
 * the current URL — from an effect that listed `searchParams` in its deps and
 * had no guard. Closing the overlay that param opened removed it, which
 * re-rendered the page, which re-ran the effect, which put the param straight
 * back: an organizer who followed a stored notification link could never close
 * the panel. (Nothing derives an overlay from the URL any more; the proposal
 * page's panel opens from local state.)
 *
 * Three properties are pinned here: ONE navigation per arrival, `replace`
 * rather than `push`, and — the case a mount-only guard silently loses — a
 * SAME-ROUTE hash navigation from an organizer already on the proposal page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const replace = vi.fn()
const push = vi.fn()

// Honest stand-ins for App Router:
//   - `useRouter()` returns a module-level SINGLETON (`publicAppRouterInstance`),
//     stable for the life of the page — so router identity never re-runs an
//     effect, which is exactly why a mount-only guard was not enough.
//   - `useSearchParams()` returns an instance memoised per canonical URL, and
//     the canonical URL includes the fragment — so it DOES get a new identity
//     on a fragment-only navigation. `nav.params` models that: swapping it is
//     how a test says "the URL changed".
const router = { replace, push, refresh: vi.fn() }
const nav = { params: new URLSearchParams('') }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => nav.params,
}))

import { ProposalMessagesRedirect } from './ProposalMessagesRedirect'

const WORKSPACE = '/admin/messages/conversation.proposal.talk-1'

/** What App Router does for a fragment-only soft navigation on this route. */
function softNavigateToHash(hash: string) {
  window.location.hash = hash
  nav.params = new URLSearchParams(nav.params.toString())
}

afterEach(() => {
  cleanup()
  replace.mockClear()
  push.mockClear()
  nav.params = new URLSearchParams('')
  window.location.hash = ''
})

describe('ProposalMessagesRedirect', () => {
  it('forwards a legacy #messages link to the messages workspace', () => {
    window.location.hash = '#messages'
    render(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(WORKSPACE)
  })

  it('replaces rather than pushes, so Back does not bounce forward again', () => {
    window.location.hash = '#messages'
    render(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(push).not.toHaveBeenCalled()
  })

  it('forwards a same-route hash navigation from an organizer already on the page', () => {
    // Arrives with no fragment — the ordinary case of viewing a proposal.
    const { rerender } = render(
      <ProposalMessagesRedirect proposalId="talk-1" />,
    )
    expect(replace).not.toHaveBeenCalled()

    // Then clicks that proposal's row in the notification bell. Same route, so
    // there is no remount and the router object is unchanged.
    act(() => softNavigateToHash('#messages'))
    rerender(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(WORKSPACE)
  })

  it('forwards a hash typed straight into the address bar', () => {
    render(<ProposalMessagesRedirect proposalId="talk-1" />)
    expect(replace).not.toHaveBeenCalled()

    // App Router never sees this one — only the browser event does.
    act(() => {
      window.location.hash = '#messages'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(WORKSPACE)
  })

  it('navigates once per arrival, however often it re-renders', () => {
    window.location.hash = '#messages'
    const { rerender } = render(
      <ProposalMessagesRedirect proposalId="talk-1" />,
    )

    // Re-renders and repeat events while the fragment is still `#messages` —
    // the churn that made the old effect re-fire forever.
    act(() => {
      nav.params = new URLSearchParams('tab=reviews')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    rerender(<ProposalMessagesRedirect proposalId="talk-1" />)
    rerender(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('does nothing without the fragment', () => {
    render(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('does nothing for an unrelated fragment', () => {
    window.location.hash = '#reviews'
    render(<ProposalMessagesRedirect proposalId="talk-1" />)

    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('renders no UI of its own', () => {
    const { container } = render(
      <ProposalMessagesRedirect proposalId="talk-1" />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
