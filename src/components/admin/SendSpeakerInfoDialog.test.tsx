/**
 * @vitest-environment jsdom
 *
 * "Send speaker info" (#1592): the channel field, the options, and the
 * Slack-first send order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const m = vi.hoisted(() => ({
  calls: [] as string[],
  saveChannel: vi.fn(),
  invalidate: vi.fn(),
  channelOptions: undefined as
    | undefined
    | {
        onSuccess: (
          d: unknown,
          i: { speakerSlackChannel: string | null },
        ) => void
      },
  post: vi.fn(),
  send: vi.fn(),
  test: vi.fn(),
}))

const mutation = (fn: (...a: unknown[]) => unknown) => ({
  mutate: fn,
  mutateAsync: fn,
  reset: vi.fn(),
  isPending: false,
  isSuccess: false,
  error: null,
})

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      conference: {
        briefingSpeakers: { invalidate: m.invalidate },
        previewBriefingSlack: { invalidate: m.invalidate },
      },
    }),
    conference: {
      updateSpeakerSlackChannel: {
        useMutation: (options: {
          onSuccess: (
            d: unknown,
            i: { speakerSlackChannel: string | null },
          ) => void
        }) => {
          m.channelOptions = options
          return mutation(m.saveChannel)
        },
      },
      previewBriefing: { useQuery: () => ({ data: { html: '<p>x</p>' } }) },
      previewBriefingSlack: {
        useQuery: () => ({ data: { blocks: [{ text: { text: '*Conf*' } }] } }),
      },
      sendBriefingTest: { useMutation: () => mutation(m.test) },
      sendBriefing: { useMutation: () => mutation(m.send) },
      postBriefingToSlack: { useMutation: () => mutation(m.post) },
    },
  },
}))

import {
  SendSpeakerInfoDialog,
  SlackChannelField,
} from './SendSpeakerInfoDialog'
import { NotificationProvider } from './NotificationProvider'

const SPEAKERS = [
  { _id: 'a', name: 'Ada' },
  { _id: 'b', name: 'Bo' },
  { _id: 'c', name: 'Cy' },
]

function dialog(props: { behind?: number; slackChannel?: string } = {}) {
  return render(
    <NotificationProvider>
      <SendSpeakerInfoDialog
        isOpen
        onClose={() => {}}
        speakers={SPEAKERS}
        behind={props.behind ?? 2}
        slackChannel={props.slackChannel ?? '#cndn-2026-speakers'}
      />
    </NotificationProvider>,
  )
}

beforeEach(() => {
  m.calls = []
  m.post.mockImplementation(async () => {
    m.calls.push('slack')
    return { channel: 'cndn-2026-speakers', lastSentAt: 'x' }
  })
  m.send.mockImplementation(async () => {
    m.calls.push('email')
    return { sent: 2, skipped: 1, failed: [], logFailed: [], remaining: 0 }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SlackChannelField', () => {
  it('saves the channel and refreshes the Slack state', () => {
    render(<SlackChannelField current="" />)
    fireEvent.change(screen.getByLabelText('Speakers Slack Channel'), {
      target: { value: ' #cndn-2026-speakers ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.saveChannel).toHaveBeenCalledWith({
      speakerSlackChannel: '#cndn-2026-speakers',
    })
    m.channelOptions!.onSuccess(undefined, {
      speakerSlackChannel: '#cndn-2026-speakers',
    })
    expect(m.invalidate).toHaveBeenCalledTimes(2)
  })

  it('clears the channel when emptied, and needs a change to save', () => {
    render(<SlackChannelField current="#old" />)
    const save = screen.getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Speakers Slack Channel'), {
      target: { value: '' },
    })
    fireEvent.click(save)
    expect(m.saveChannel).toHaveBeenCalledWith({ speakerSlackChannel: null })
  })
})

describe('SendSpeakerInfoDialog', () => {
  it('labels the send with the totals and follows the options', () => {
    dialog()
    expect(
      screen.getByRole('button', {
        name: 'Email 2 speakers and post to #cndn-2026-speakers',
      }),
    ).toBeTruthy()
    fireEvent.click(screen.getByLabelText('All confirmed speakers (3)'))
    expect(
      screen.getByRole('button', {
        name: 'Email 3 speakers and post to #cndn-2026-speakers',
      }),
    ).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Email to confirmed speakers'))
    expect(
      screen.getByRole('button', { name: 'Post to #cndn-2026-speakers' }),
    ).toBeTruthy()
  })

  it('disables Slack without a channel, and Send when there is nothing to do', () => {
    dialog({ behind: 0, slackChannel: '' })
    expect(
      (screen.getByLabelText(/Post to Slack/) as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      screen.getByText('All confirmed speakers have the current version.'),
    ).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Email 0 speakers',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByLabelText('Email to confirmed speakers'))
    expect(screen.getByText('Choose email, Slack or both.')).toBeTruthy()
  })

  it('posts to Slack first, then runs the email loop with the note', async () => {
    dialog()
    fireEvent.change(screen.getByLabelText(/Note from the organizers/), {
      target: { value: ' Doors open at 8 ' },
    })
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Email 2 speakers and post to #cndn-2026-speakers',
        }),
      )
    })
    await waitFor(() =>
      expect(screen.getByText('Emailed 2 speakers.')).toBeTruthy(),
    )
    expect(m.calls).toEqual(['slack', 'email'])
    expect(m.post).toHaveBeenCalledWith({
      mentionChannel: false,
      note: 'Doors open at 8',
    })
    expect(m.send).toHaveBeenCalledWith({ note: 'Doors open at 8' })
    expect(screen.getByText('Posted to #cndn-2026-speakers.')).toBeTruthy()
  })

  it('asks before emailing after a Slack failure', async () => {
    m.post.mockRejectedValueOnce(
      new Error(
        'Invite the Slack bot to #cndn-2026-speakers, then post again.',
      ),
    )
    dialog()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Email 2 speakers and post to #cndn-2026-speakers',
        }),
      )
    })
    expect(screen.getByRole('alert').textContent).toContain('Slack failed:')
    expect(m.send).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Send the email anyway' }),
      )
    })
    await waitFor(() => expect(m.send).toHaveBeenCalled())
  })

  it('forces a resend to everyone with one run id across continuations', async () => {
    m.send
      .mockImplementationOnce(async () => ({
        sent: 2,
        skipped: 0,
        failed: [],
        logFailed: [],
        remaining: 1,
      }))
      .mockImplementationOnce(async () => ({
        sent: 1,
        skipped: 0,
        failed: [],
        logFailed: [],
        remaining: 0,
      }))
    dialog()
    fireEvent.click(screen.getByLabelText(/Post to #/))
    fireEvent.click(screen.getByLabelText('All confirmed speakers (3)'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Email 3 speakers' }))
    })
    await waitFor(() =>
      expect(screen.getByText('Emailed 3 speakers.')).toBeTruthy(),
    )
    const [first, second] = m.send.mock.calls.map((c) => c[0])
    expect(first).toMatchObject({ force: true })
    expect(second.runId).toBe(first.runId)
    expect(m.post).not.toHaveBeenCalled()
  })

  it('continues an interrupted forced run with the same run id', async () => {
    m.send
      .mockImplementationOnce(async () => ({
        sent: 2,
        skipped: 0,
        failed: [],
        logFailed: [],
        remaining: 1,
      }))
      .mockRejectedValueOnce(new Error('Network down.'))
      .mockImplementationOnce(async () => ({
        sent: 1,
        skipped: 0,
        failed: [],
        logFailed: [],
        remaining: 0,
      }))
    dialog()
    fireEvent.click(screen.getByLabelText(/Post to #/))
    fireEvent.click(screen.getByLabelText('All confirmed speakers (3)'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Email 3 speakers' }))
    })
    await waitFor(() =>
      expect(
        screen.getByText(/Still sending, or the connection timed out\./),
      ).toBeTruthy(),
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    })
    await waitFor(() =>
      expect(screen.getByText('Emailed 1 speaker.')).toBeTruthy(),
    )
    const ids = m.send.mock.calls.map((c) => c[0].runId)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBeTruthy()
  })

  it('says who was not attempted when a call makes no progress', async () => {
    m.send.mockImplementationOnce(async () => ({
      sent: 0,
      skipped: 0,
      failed: [{ speakerId: 'a', name: 'Ada', error: 'bad address' }],
      logFailed: [],
      remaining: 1,
    }))
    dialog()
    fireEvent.click(screen.getByLabelText(/Post to #/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Email 2 speakers' }))
    })
    await waitFor(() =>
      expect(
        screen.getByText('1 speaker not attempted yet. Send again.'),
      ).toBeTruthy(),
    )
    expect(screen.queryByText(/^Emailed/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy()
  })

  it('turns Slack on after a channel is saved in the dialog', () => {
    const view = dialog({ slackChannel: '' })
    fireEvent.change(screen.getByLabelText('Speakers Slack Channel'), {
      target: { value: '#new' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      m.channelOptions!.onSuccess(undefined, { speakerSlackChannel: '#new' })
    })
    view.rerender(
      <NotificationProvider>
        <SendSpeakerInfoDialog
          isOpen
          onClose={() => {}}
          speakers={SPEAKERS}
          behind={2}
          slackChannel="#new"
        />
      </NotificationProvider>,
    )
    expect(
      (screen.getByLabelText(/Post to #new/) as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByLabelText('Speakers Slack Channel') as HTMLInputElement)
        .value,
    ).toBe('#new')
  })
})

describe('a stopped email loop', () => {
  async function stopWith(error: unknown) {
    m.send.mockRejectedValueOnce(error)
    dialog()
    fireEvent.click(screen.getByLabelText(/Post to #/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Email 2 speakers' }))
    })
  }

  it('treats a timeout as still sending, not as a failure', async () => {
    await stopWith(new TypeError('Failed to fetch'))
    const line = await screen.findByText(
      'Still sending, or the connection timed out. Press Send again to continue; nobody gets it twice.',
    )
    const status = line.closest('ul')!
    expect(status.getAttribute('role')).toBe('status')
    expect(status.className).not.toContain('text-red')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(m.invalidate).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeTruthy()
  })

  it('shows a server error as a failure', async () => {
    await stopWith(
      Object.assign(new Error('Could not resolve conference from domain'), {
        data: { code: 'NOT_FOUND' },
      }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Stopped after sending 0 of 2.')
    expect(alert.className).toContain('text-red')
  })
})

describe('two channel fields', () => {
  it('follows a save made elsewhere unless edited here', () => {
    const view = render(<SlackChannelField current="#old" />)
    view.rerender(<SlackChannelField current="#new" />)
    const input = screen.getByLabelText(
      'Speakers Slack Channel',
    ) as HTMLInputElement
    expect(input.value).toBe('#new')
    fireEvent.change(input, { target: { value: '#mine' } })
    view.rerender(<SlackChannelField current="#other" />)
    expect(input.value).toBe('#mine')
  })
})
