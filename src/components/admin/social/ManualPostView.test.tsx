/**
 * @vitest-environment jsdom
 *
 * Round 4, T4: a screen-reader user hears the tag check START ("Checking…")
 * and hears it FINISH. The announcement lives in ONE status region that is
 * mounted for the whole life of the view: a region inserted at the same
 * moment as its text is unreliably announced, and one that is removed
 * announces nothing at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { SocialPostVariant } from '@/lib/social/types'
import { ManualPostView } from './ManualPostView'

const variant: SocialPostVariant = {
  _id: 'v-1',
  _rev: 'r1',
  postId: 'p-1',
  conferenceId: 'c-1',
  orgId: 'o-1',
  platform: 'bluesky',
  body: 'Hello @alice.dev',
  status: 'awaiting-manual',
  scheduledAt: null,
  usesCustomTime: false,
  claimedAt: null,
  submission: null,
  shortCode: null,
  link: null,
  attachments: [],
  publishResult: null,
  attempts: [],
  attemptCount: 0,
}

afterEach(cleanup)

describe('ManualPostView — the tag check is announced start to finish', () => {
  it('one status region, present throughout, says checking and then ready', () => {
    const view = (
      manualBody: Parameters<typeof ManualPostView>[0]['manualBody'],
    ) => (
      <ManualPostView
        variant={variant}
        postedLink={null}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
        manualBody={manualBody}
      />
    )
    const { rerender } = render(view({ checking: true }))
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/checking/i)

    rerender(
      view({
        body: 'Hello Alice Smith',
        untagged: ['Alice Smith'],
        removed: 0,
      }),
    )
    // The SAME node, now saying the text is ready.
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toMatch(/ready to copy/i)
  })
})

describe('ManualPostView — the link a reader sees is the short link (short-links spec §2.3)', () => {
  const SHORT = 'https://cndn.test/go/abc987'
  const LONG =
    'https://cndn.test/program?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=t'
  const coded = (body: string): SocialPostVariant => ({
    ...variant,
    body,
    link: LONG,
    shortCode: 'abc987',
  })
  const show = (body: string) =>
    render(
      <ManualPostView
        variant={coded(body)}
        postedLink={SHORT}
        postAttachments={[]}
        onMarkPosted={vi.fn()}
      />,
    )

  it('does not append a second link when the body already holds the short URL', () => {
    show(`See the program: ${SHORT}`)
    // 17 + 27 characters: the body alone, no link added.
    expect(screen.getByText(/^44 \/ 300$/)).toBeTruthy()
    expect(screen.queryByText(/The link is added at the end/)).toBeNull()
  })

  it('appends the SHORT link, and counts it, when the body has none', () => {
    show('Hi')
    // "Hi" + a blank line + the 27-character short link.
    expect(
      screen.getByText(/^31 \/ 300 · The link is added at the end\.$/),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: SHORT })).toBeTruthy()
    expect(screen.queryByText(LONG)).toBeNull()
  })

  it('does not append the short link to copy that already holds the long one', () => {
    show(`From before short links: ${LONG}`)
    expect(screen.queryByText(/The link is added at the end/)).toBeNull()
  })
})
