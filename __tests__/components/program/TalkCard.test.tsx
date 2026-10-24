/**
 * @vitest-environment jsdom
 */
import { afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('keeps the plain link for navigation without the sheet', () => {
    renderCard(confirmed)
    expect(link().getAttribute('href')).toBe('/program/talk-1/feedback')
  })
})
