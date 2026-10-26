/**
 * @vitest-environment jsdom
 *
 * Remove on `/admin/feedback` (speaker feedback spec §10.3) sends the
 * answer as the page showed it: its id AND the time shown. Without the
 * time the server keeps the response as "changed", so Remove would remove
 * nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { AdminFeedbackOverview } from '@/lib/feedback/admin'
import { feedbackTotals } from '@/lib/feedback/totals'
import { SessionFeedbackAdmin } from './SessionFeedbackAdmin'

const totals = feedbackTotals({ live: { green: 0, yellow: 0, red: 1 } })
const OVERVIEW: AdminFeedbackOverview = {
  totals,
  comments: 1,
  flagged: 0,
  sessions: [
    {
      talkId: 'talk-a',
      title: 'Kubernetes the hard way',
      speakers: ['Ada'],
      format: null,
      slotAt: null,
      totals,
      comments: [
        {
          id: 'feedbackResponse-1',
          colour: 'red',
          comment: 'Rude remark',
          submittedAt: '2026-10-27T09:10:00Z',
          hidden: false,
          flagged: false,
          rev: 'rev-1',
          judgement: null,
          kept: null,
        },
      ],
    },
  ],
}

afterEach(cleanup)

describe('SessionFeedbackAdmin Remove', () => {
  it('sends the answer as shown, and says when it had changed', async () => {
    const onRemove = vi.fn(async () => ({ removed: 0, gone: 0, changed: 1 }))
    render(
      <SessionFeedbackAdmin
        overview={OVERVIEW}
        onHide={vi.fn()}
        onUnhide={vi.fn()}
        onKeep={vi.fn()}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Kubernetes the hard way/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const confirm = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: 'Remove' },
    )
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-disabled'), {
      timeout: 2000,
    })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(onRemove).toHaveBeenCalledWith({
        responses: [
          { id: 'feedbackResponse-1', submittedAt: '2026-10-27T09:10:00Z' },
        ],
      }),
    )
    expect(
      await screen.findByText('It had changed since you looked and was kept.', {
        selector: 'p:not([role])',
      }),
    ).toBeTruthy()
  })
})
