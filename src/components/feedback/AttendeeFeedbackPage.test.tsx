/**
 * @vitest-environment jsdom
 *
 * The attendee page inside the programme's feedback sheet (speaker feedback
 * spec §7.5): the sheet frames it, so it drops the chrome a full page needs.
 * "Back to the programme" would load the programme INSIDE the sheet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  AttendeeFeedbackPage,
  type AttendeeFeedbackState,
} from './AttendeeFeedbackPage'

afterEach(cleanup)

const answered: AttendeeFeedbackState = {
  state: 'answered',
  colour: 'green',
  comment: null,
  talk: { title: 'GitOps Best Practices', speakers: ['Alice Johnson'] },
}

const page = (embedded?: boolean) => (
  <AttendeeFeedbackPage
    logo={{ title: 'Cloud Native Days Norway' }}
    page={answered}
    submit={vi.fn()}
    remove={vi.fn()}
    embedded={embedded}
  />
)

describe('AttendeeFeedbackPage', () => {
  it('shows the logo and the way back to the programme as a page', () => {
    render(page())
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /back to the programme/i }),
    ).toBeTruthy()
  })

  it('drops both inside the programme sheet, keeping the answer', () => {
    render(page(true))
    expect(screen.queryByRole('banner')).toBeNull()
    expect(
      screen.queryByRole('link', { name: /back to the programme/i }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'GitOps Best Practices' }),
    ).toBeTruthy()
  })

  const notYetOpen: AttendeeFeedbackState = {
    state: 'not-yet-open',
    talk: answered.state === 'answered' ? answered.talk : null,
    opensAt: '2026-10-26T08:00:00.000Z',
    canDelete: false,
  }

  it('sends the attendee back to the programme, not a QR, before it opens', () => {
    const { rerender } = render(
      <AttendeeFeedbackPage
        logo={null}
        page={notYetOpen}
        submit={vi.fn()}
        remove={vi.fn()}
      />,
    )
    expect(screen.getByText(/Scan the code again then\./)).toBeTruthy()

    rerender(
      <AttendeeFeedbackPage
        logo={null}
        page={notYetOpen}
        submit={vi.fn()}
        remove={vi.fn()}
        embedded
      />,
    )
    expect(screen.getByText(/Come back to the programme then\./)).toBeTruthy()
    expect(screen.queryByText(/scan/i)).toBeNull()
  })

  it('names no code on Unknown inside the programme sheet', () => {
    render(
      <AttendeeFeedbackPage
        logo={null}
        page={{ state: 'unknown' }}
        submit={vi.fn()}
        remove={vi.fn()}
        embedded
      />,
    )
    expect(
      screen.getByRole('heading', {
        name: "Feedback isn't available for this session",
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/code/i)).toBeNull()
  })
})
