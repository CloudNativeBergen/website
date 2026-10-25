/**
 * @vitest-environment jsdom
 *
 * The Speakers Slack Channel, saved from the speaker info page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const m = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidateSpeakers: vi.fn(),
  invalidateSlack: vi.fn(),
  options: undefined as undefined | { onSuccess: () => void },
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      conference: {
        briefingSpeakers: { invalidate: m.invalidateSpeakers },
        previewBriefingSlack: { invalidate: m.invalidateSlack },
      },
    }),
    conference: {
      updateSpeakerSlackChannel: {
        useMutation: (options: { onSuccess: () => void }) => {
          m.options = options
          return {
            mutate: m.mutate,
            reset: vi.fn(),
            isPending: false,
            isSuccess: false,
            error: null,
          }
        },
      },
    },
  },
}))

import { SlackChannelField } from './SpeakerBriefingPanel'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SlackChannelField', () => {
  it('saves the channel and refreshes the Slack state', () => {
    render(<SlackChannelField current="" />)
    const input = screen.getByLabelText('Speakers Slack Channel')
    fireEvent.change(input, { target: { value: ' #cndn-2026-speakers ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.mutate).toHaveBeenCalledWith({
      speakerSlackChannel: '#cndn-2026-speakers',
    })
    m.options!.onSuccess()
    expect(m.invalidateSpeakers).toHaveBeenCalled()
    expect(m.invalidateSlack).toHaveBeenCalled()
  })

  it('clears the channel when emptied', () => {
    render(<SlackChannelField current="#old" />)
    fireEvent.change(screen.getByLabelText('Speakers Slack Channel'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.mutate).toHaveBeenCalledWith({ speakerSlackChannel: null })
  })

  it('keeps Save disabled until the value changes', () => {
    render(<SlackChannelField current="#same" />)
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})
