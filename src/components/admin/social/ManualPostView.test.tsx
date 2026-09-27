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
