/**
 * @vitest-environment jsdom
 *
 * THE FORMAT LIMIT IS ADVISORY IN THE ORGANIZER PICKER (#1023).
 *
 * `maxSpeakers` comes from `getTotalSpeakerLimit(format)` — a CFP-submission
 * rule. It used to disable the Add control, which meant a format switch to a
 * smaller format left an over-limit list in place with nothing said about it.
 * Now the organizer can add past it and the component says how far over.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const speakers = [
  { _id: 'sp-1', name: 'Anna', title: null, email: null, image: null },
  { _id: 'sp-2', name: 'Erik', title: null, email: null, image: null },
  { _id: 'sp-3', name: 'Sofia', title: null, email: null, image: null },
]

vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: {
      admin: {
        list: {
          useQuery: () => ({ data: speakers, isLoading: false, error: null }),
        },
      },
    },
  },
}))
vi.mock('@/components/SpeakerAvatars', () => ({ SpeakerAvatars: () => null }))

import { SpeakerMultiSelect } from './SpeakerMultiSelect'

describe('SpeakerMultiSelect over the format limit', () => {
  it('says nothing while the list is within the limit', () => {
    render(
      <SpeakerMultiSelect
        selectedSpeakerIds={['sp-1', 'sp-2']}
        onChange={vi.fn()}
        maxSpeakers={2}
      />,
    )
    expect(screen.queryByText(/over the format limit/i)).toBeNull()
  })

  it('lets an organizer add past the limit', () => {
    const onChange = vi.fn()
    render(
      <SpeakerMultiSelect
        selectedSpeakerIds={['sp-1', 'sp-2']}
        onChange={onChange}
        maxSpeakers={2}
      />,
    )

    const add = screen.getByRole('button', { name: /add speaker/i })
    expect(add).not.toBeDisabled()

    fireEvent.click(add)
    fireEvent.click(screen.getByText('Sofia'))

    expect(onChange).toHaveBeenCalledWith(['sp-1', 'sp-2', 'sp-3'])
  })

  it('reports the overage, and who the limit still binds', () => {
    render(
      <SpeakerMultiSelect
        selectedSpeakerIds={['sp-1', 'sp-2', 'sp-3']}
        onChange={vi.fn()}
        maxSpeakers={1}
      />,
    )

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('2 over the format limit')
    expect(notice).toHaveTextContent('3 selected, 1 allowed at submission')
    expect(notice).toHaveTextContent(/invitations still stop at the format/i)
  })

  it('THE FORMAT SWITCH: a lower limit keeps the list and raises the notice', () => {
    const { rerender } = render(
      <SpeakerMultiSelect
        selectedSpeakerIds={['sp-1', 'sp-2', 'sp-3']}
        onChange={vi.fn()}
        maxSpeakers={3}
      />,
    )
    expect(screen.queryByRole('status')).toBeNull()

    // Organizer switches presentation_40 -> presentation_20 in the modal.
    rerender(
      <SpeakerMultiSelect
        selectedSpeakerIds={['sp-1', 'sp-2', 'sp-3']}
        onChange={vi.fn()}
        maxSpeakers={2}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 over the format limit',
    )
    // Nothing was trimmed.
    expect(screen.getByText('Sofia')).toBeInTheDocument()
  })
})
