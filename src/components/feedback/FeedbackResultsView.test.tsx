/**
 * @vitest-environment jsdom
 *
 * The speaker's Flag (speaker feedback spec §9.3, §10.3): a question left
 * open when another speaker's flag arrives must not come back by itself
 * after an organizer's Keep.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SpeakerComment } from '@/lib/feedback/results'
import { feedbackTotals } from '@/lib/feedback/totals'
import { FeedbackResultsView } from './FeedbackResultsView'

afterEach(cleanup)

const QUESTION = /Flag this comment for organizers\?/
const c: SpeakerComment = {
  id: 'feedbackResponse-1',
  colour: 'red',
  comment: 'Too fast',
  submittedAt: '2026-10-27T09:40:00.000Z',
  flagged: false,
}
const view = (comment: SpeakerComment, onFlag = vi.fn(async () => {})) => (
  <FeedbackResultsView
    totals={feedbackTotals({ live: { green: 1, yellow: 0, red: 1 } })}
    comments={[comment]}
    live={false}
    onFlag={onFlag}
  />
)

describe('FeedbackResultsView — a flag that arrives from elsewhere', () => {
  it('closes this speaker’s open question for good: a later Keep does not reopen it', () => {
    const { rerender } = render(view(c))
    fireEvent.click(screen.getByRole('button', { name: 'Flag' }))
    expect(screen.getByText(QUESTION)).toBeTruthy()
    // Another speaker flagged it: a refresh says so.
    rerender(view({ ...c, flagged: true }))
    expect(screen.getByText('Flagged for organizers')).toBeTruthy()
    // An organizer kept it: a later refresh says it is no longer flagged.
    rerender(view({ ...c, flagged: false }))
    expect(screen.queryByText(QUESTION)).toBeNull()
    expect(screen.getByRole('button', { name: 'Flag' })).toBeTruthy()
  })

  it('clears a failed flag’s message once the comment is flagged after all', async () => {
    const onFlag = vi.fn(async () => {
      throw new Error('503')
    })
    const { rerender } = render(view(c, onFlag))
    fireEvent.click(screen.getByRole('button', { name: 'Flag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flag for organizers' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    rerender(view({ ...c, flagged: true }, onFlag))
    rerender(view({ ...c, flagged: false }, onFlag))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
