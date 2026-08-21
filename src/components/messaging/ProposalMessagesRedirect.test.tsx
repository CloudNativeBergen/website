/**
 * @vitest-environment jsdom
 *
 * The legacy `#messages` deep link, and the reopen loop it used to cause.
 *
 * `conversationLinkPath()` still points organizer proposal-thread notifications
 * at `/admin/proposals/<id>#messages`, and those strings are already persisted
 * in Sanity, so arriving with that fragment must land somewhere correct.
 *
 * The component this replaces answered the fragment by adding `?messageId=` to
 * the current URL — from an effect that listed `searchParams` in its deps and
 * had no once-guard. Closing the resulting slide-over removed the param, which
 * re-rendered the page, which re-ran the effect, which put the param straight
 * back: an organizer who followed a stored notification link could never close
 * the panel. These tests pin the two properties that kill that loop — ONE
 * navigation per mount, and `replace` rather than `push`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const replace = vi.fn()
const push = vi.fn()

// Deliberately returns a FRESH router object per call, exactly as
// `next/navigation` does. That makes the effect's dep array change on every
// render, so a missing once-guard shows up as repeated navigation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}))

import { ProposalMessagesRedirect } from './ProposalMessagesRedirect'

const WORKSPACE = '/admin/messages/conversation.proposal.talk-1'

afterEach(() => {
  cleanup()
  replace.mockClear()
  push.mockClear()
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

  it('navigates at most once however often it re-renders', () => {
    window.location.hash = '#messages'
    const { rerender } = render(
      <ProposalMessagesRedirect proposalId="talk-1" />,
    )

    // Each rerender hands the effect a brand-new router object — the exact
    // dep-identity churn that made the old effect re-fire forever.
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
