/**
 * @vitest-environment jsdom
 *
 * #602: posting a note from inside the sponsor editor form must not submit
 * that form (a page reload that lost the note); it calls the mutation.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SponsorActivityInput } from './SponsorActivityInput'

const mutate = vi.fn()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        activities: {
          create: { useMutation: () => ({ mutate, isPending: false }) },
        },
      },
    },
  },
}))
vi.mock('@/hooks/useRefreshSponsor', () => ({
  useRefreshSponsor: () => vi.fn(),
}))

describe('SponsorActivityInput', () => {
  it('posts the note without submitting the surrounding form', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <SponsorActivityInput sponsorForConferenceId="sfc-1" />
      </form>,
    )
    fireEvent.change(screen.getByLabelText('Log a note'), {
      target: { value: ' Called them ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post activity' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledWith({
      sponsorForConferenceId: 'sfc-1',
      activityType: 'note',
      description: 'Called them',
    })
  })
})
