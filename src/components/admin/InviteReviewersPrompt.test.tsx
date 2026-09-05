/**
 * @vitest-environment jsdom
 *
 * The "invite your reviewers" nudge on /admin/proposals (platform#49 phase 2).
 * The contract under test: it renders in EXACTLY one state — one organizer AND
 * at least one proposal — and a dismissal persists, so it never nags.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import {
  InviteReviewersPrompt,
  INVITE_REVIEWERS_DISMISS_KEY,
} from './InviteReviewersPrompt'

const HEADING = /invite your reviewers/i

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('InviteReviewersPrompt', () => {
  it('renders for one organizer with a proposal in, linking to the organizer section', () => {
    render(<InviteReviewersPrompt organizerCount={1} proposalCount={1} />)
    expect(screen.getByText(HEADING)).toBeDefined()
    expect(
      screen.getByRole('link', { name: /invite co-organizers/i }),
    ).toHaveProperty(
      'href',
      expect.stringContaining('/admin/settings#team-content'),
    )
  })

  it('never renders for a conference with two organizers', () => {
    render(<InviteReviewersPrompt organizerCount={2} proposalCount={5} />)
    expect(screen.queryByText(HEADING)).toBeNull()
  })

  it('never renders before the first proposal', () => {
    render(<InviteReviewersPrompt organizerCount={1} proposalCount={0} />)
    expect(screen.queryByText(HEADING)).toBeNull()
  })

  it('the condition outranks the forceVisible story seam', () => {
    render(
      <InviteReviewersPrompt
        organizerCount={2}
        proposalCount={1}
        forceVisible
      />,
    )
    expect(screen.queryByText(HEADING)).toBeNull()
  })

  it('dismiss hides it, persists, and it stays hidden on remount', () => {
    const { unmount } = render(
      <InviteReviewersPrompt organizerCount={1} proposalCount={1} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(HEADING)).toBeNull()
    expect(window.localStorage.getItem(INVITE_REVIEWERS_DISMISS_KEY)).toBe(
      'true',
    )

    unmount()
    render(<InviteReviewersPrompt organizerCount={1} proposalCount={1} />)
    expect(screen.queryByText(HEADING)).toBeNull()
  })
})
