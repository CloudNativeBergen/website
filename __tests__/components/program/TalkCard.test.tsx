/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, vi } from 'vitest'
import { FRAME_TIMEOUT_MS } from '@/components/program/FeedbackSheet'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { TalkCard } from '@/components/program/TalkCard'
import { BookmarksProvider } from '@/contexts/BookmarksContext'
import type { TrackTalk } from '@/lib/conference/types'

type CardTalk = TrackTalk & {
  scheduleDate: string
  trackTitle: string
  trackIndex: number
}

const baseSlot = {
  startTime: '09:00',
  endTime: '09:30',
  scheduleDate: '2026-03-10',
  trackTitle: 'Track A',
  trackIndex: 0,
}

function renderCard(talk: CardTalk) {
  return render(
    <BookmarksProvider>
      <TalkCard talk={talk} />
    </BookmarksProvider>,
  )
}

describe('TalkCard service session vs dangling reference', () => {
  it('renders a genuine service session (placeholder, no talk ref)', () => {
    const { container } = renderCard({
      ...baseSlot,
      placeholder: 'Lunch Break',
    })

    expect(container.textContent).toContain('Lunch Break')
  })

  it('falls back to "Service Session" for a placeholder-less slot with no talk ref', () => {
    const { container } = renderCard({ ...baseSlot })

    expect(container.textContent).toContain('Service Session')
  })

  it('renders nothing for a dangling talk reference (proposal deleted)', () => {
    // hasTalkRef true but the reference did not resolve (talk is undefined):
    // the proposal was deleted. This must NOT be mislabelled as a service
    // session — it should be dropped entirely.
    const { container } = renderCard({
      ...baseSlot,
      hasTalkRef: true,
    })

    expect(container.firstChild).toBeNull()
    expect(container.textContent).not.toContain('Service Session')
  })
})

/**
 * The programme's feedback link (speaker feedback spec §7.5) opens a bottom
 * sheet framing the attendee page. The `<a href>` stays the way in for every
 * click the sheet does not take (new tab, new window, no JS).
 */
describe('TalkCard feedback sheet', () => {
  afterEach(cleanup)
  // jsdom's history outlives each test. Push a plain entry: it starts the test
  // off the sheet entry an earlier test left open, and drops any forward
  // entries an earlier Back left, so the next push grows the history.
  beforeEach(() => window.history.pushState(null, ''))

  const confirmed = {
    ...baseSlot,
    talk: {
      _id: 'talk-1',
      title: 'GitOps Best Practices',
      status: 'confirmed',
      hasFeedbackCode: true,
      speakers: [],
    },
  } as unknown as CardTalk
  const link = () =>
    screen.getByRole('link', { name: 'Give feedback on GitOps Best Practices' })

  it('opens the sheet on a plain click, framing the embedded attendee page', () => {
    renderCard(confirmed)
    expect(screen.queryByRole('dialog')).toBeNull()

    // false: the click's navigation was prevented.
    expect(fireEvent.click(link())).toBe(false)

    const dialog = screen.getByRole('dialog', { name: 'Session feedback' })
    const frame = dialog.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('/program/talk-1/feedback?embed=1')
    expect(frame?.getAttribute('title')).toBe(
      'Feedback on GitOps Best Practices',
    )
  })

  it.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['middle', { button: 1 }],
  ])('leaves a %s click to the browser', (_, modifiers) => {
    renderCard(confirmed)
    expect(fireEvent.click(link(), modifiers)).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers the full page when the frame never shows the attendee page', () => {
    vi.useFakeTimers()
    try {
      renderCard(confirmed)
      fireEvent.click(link())
      const dialog = screen.getByRole('dialog', { name: 'Session feedback' })
      expect(within(dialog).queryByRole('link')).toBeNull()

      act(() => vi.advanceTimersByTime(FRAME_TIMEOUT_MS))

      const fallback = within(dialog).getByRole('link', {
        name: 'Open the feedback page',
      })
      expect(fallback.getAttribute('href')).toBe('/program/talk-1/feedback')
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes on Back, through the one history entry it added', async () => {
    renderCard(confirmed)
    const before = window.history.length
    fireEvent.click(link())
    expect(window.history.length).toBe(before + 1)
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('dialog')).toBeTruthy()

    act(() => window.history.back())

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('steps back over its entry when closed, so Back then leaves the page', async () => {
    renderCard(confirmed)
    fireEvent.click(link())
    const opened = window.history.state

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(window.history.state).not.toEqual(opened))
    // The sheet's leave transition runs before the dialog unmounts.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  /** The programme page's own entry, with one entry before it. */
  const onProgramme = () => {
    window.history.replaceState({ entry: 'before' }, '')
    window.history.pushState({ entry: 'programme' }, '')
  }
  const settled = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  it('steps back only once when closed twice in a row', async () => {
    // Browsers run every queued `back()`; jsdom folds two into one, so count
    // the calls rather than read where history ends up.
    const back = vi.spyOn(window.history, 'back')
    try {
      onProgramme()
      renderCard(confirmed)
      fireEvent.click(link())
      const close = screen.getByRole('button', { name: 'Close' })

      fireEvent.click(close)
      fireEvent.click(close)
      await settled()

      expect(back).toHaveBeenCalledTimes(1)
      await waitFor(() =>
        expect(window.history.state).toEqual({ entry: 'programme' }),
      )
    } finally {
      back.mockRestore()
    }
  })

  it('reuses a sheet entry left by Forward, so one Back still leaves it', async () => {
    onProgramme()
    renderCard(confirmed)
    fireEvent.click(link())
    act(() => window.history.back())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    act(() => window.history.forward())
    // jsdom traverses on a task: wait for it rather than a fixed delay, which
    // a loaded runner can outlast.
    await waitFor(() =>
      expect(window.history.state).toEqual({ feedbackSheet: true }),
    )
    const length = window.history.length

    fireEvent.click(link())
    expect(window.history.length).toBe(length)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() =>
      expect(window.history.state).toEqual({ entry: 'programme' }),
    )
  })

  it('keeps the plain link for navigation without the sheet', () => {
    renderCard(confirmed)
    expect(link().getAttribute('href')).toBe('/program/talk-1/feedback')
  })
})
