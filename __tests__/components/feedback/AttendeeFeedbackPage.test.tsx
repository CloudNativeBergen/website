/**
 * @vitest-environment jsdom
 *
 * The stale tab (adversarial round 2): this tab believes there is no comment,
 * another tab sent one. A colour change brings the stored comment back; the
 * untouched box follows it, and Update comment re-sends THAT comment, never
 * an empty box that would erase it. And a comment the server could not read
 * back is unknown: the page keeps what it last knew.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttendeeFeedbackPage } from '@/components/feedback/AttendeeFeedbackPage'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'

vi.mock('@/components/ConferenceLogo', () => ({
  ConferenceLogo: () => null,
}))

const talk = { title: 'A talk', speakers: [] }

/** The server as it answers: the colour, and the comment as STORED. */
function server(stored: string | null) {
  let comment = stored
  const submit = vi.fn(
    async (colour: 'green' | 'yellow' | 'red', sent?: string) => {
      if (sent !== undefined) comment = sent.trim() || null
      return { state: 'answered', colour, comment, talk } as const
    },
  )
  return { submit, stored: () => comment }
}

const remove = vi.fn(async () => ({
  deleted: false as const,
  page: { state: 'unavailable' } as const,
}))

afterEach(cleanup)

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('the stale tab', () => {
  it('shows the comment a colour change brought back, and Update re-sends it', async () => {
    const { submit, stored } = server('Great demo')
    render(
      <AttendeeFeedbackPage
        logo={null}
        page={{ state: 'answered', colour: 'green', comment: null, talk }}
        submit={submit}
        remove={remove}
      />,
    )
    const box = screen.getByLabelText('Comment for the speaker (optional)')
    expect(box).toHaveValue('')

    click('Change answer')
    click('Not for me')
    expect(submit.mock.calls[0]).toEqual(['red'])
    await waitFor(() => expect(box).toHaveValue('Great demo'))

    click('Update comment')
    await waitFor(() =>
      expect(submit).toHaveBeenLastCalledWith('red', 'Great demo'),
    )
    expect(stored()).toBe('Great demo')
    expect(screen.queryByText('Comment removed.')).toBeNull()
  })

  it('keeps an edit the attendee made while the stored comment changes under it', async () => {
    const { submit } = server('Great demo')
    render(
      <AttendeeFeedbackPage
        logo={null}
        page={{ state: 'answered', colour: 'green', comment: null, talk }}
        submit={submit}
        remove={remove}
      />,
    )
    const box = screen.getByLabelText('Comment for the speaker (optional)')
    fireEvent.change(box, { target: { value: 'my draft' } })
    click('Change answer')
    click('It was OK')
    await waitFor(() =>
      expect(screen.getByText(/You answered/)).toHaveTextContent('It was OK'),
    )
    expect(box).toHaveValue('my draft')
  })

  it('keeps keystrokes typed while a send is in flight, unsent', async () => {
    let finish!: (value: AttendeeFeedbackState) => void
    const submit = vi.fn(
      (colour: 'green' | 'yellow' | 'red', sent?: string) =>
        new Promise<AttendeeFeedbackState>((resolve) => {
          finish = () =>
            resolve({
              state: 'answered',
              colour,
              comment: sent?.trim() || null,
              talk,
            })
        }),
    )
    render(
      <AttendeeFeedbackPage
        logo={null}
        page={{ state: 'answered', colour: 'green', comment: null, talk }}
        submit={submit}
        remove={remove}
      />,
    )
    const box = screen.getByLabelText('Comment for the speaker (optional)')
    fireEvent.change(box, { target: { value: 'Hello' } })
    click('Send comment')
    expect(submit).toHaveBeenCalledWith('green', 'Hello')
    fireEvent.change(box, { target: { value: 'Hello world' } })
    finish({ state: 'answered', colour: 'green', comment: 'Hello', talk })
    await screen.findByText('Comment sent.')
    expect(box).toHaveValue('Hello world')
    expect(
      screen.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  })

  it('keeps the last known comment when the server could not read it back', async () => {
    const submit = vi.fn(
      async (colour: 'green' | 'yellow' | 'red') =>
        ({ state: 'answered', colour, comment: undefined, talk }) as const,
    )
    render(
      <AttendeeFeedbackPage
        logo={null}
        page={{
          state: 'answered',
          colour: 'green',
          comment: 'Known before',
          talk,
        }}
        submit={submit as never}
        remove={remove}
      />,
    )
    click('Change answer')
    click('Not for me')
    await waitFor(() =>
      expect(screen.getByText(/You answered/)).toHaveTextContent('Not for me'),
    )
    expect(
      screen.getByLabelText('Comment for the speaker (optional)'),
    ).toHaveValue('Known before')
    expect(
      screen.getByRole('button', { name: 'Update comment' }),
    ).toBeInTheDocument()
  })
})

// The page's own state type is what the stubs answer with.
export type _Check = AttendeeFeedbackState
