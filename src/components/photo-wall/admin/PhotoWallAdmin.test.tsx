/**
 * @vitest-environment jsdom
 *
 * The Posting row of `/admin/photo-wall` (Photo Wall spec §7, §10): the note
 * it shows for each posting state, word for word, and whether that note is a
 * warning. A warning is told apart by colour and weight only (amber, medium);
 * the words carry the meaning, so the class is what is asserted for it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { PhotoWallAdminView, PostingState } from '@/lib/photo-wall'
import { PhotoWallAdmin } from './PhotoWallAdmin'

// The QR is drawn on a canvas jsdom does not have; not what is tested here.
vi.mock('@/components/feedback/useFeedbackQrPng', () => ({
  useFeedbackQrPng: () => ({ failed: false }),
}))

afterEach(cleanup)

const view = (posting: PostingState): PhotoWallAdminView => ({
  wall: {
    _id: 'photoWall-conf-A',
    postingMode: 'auto',
    sponsorStrip: false,
    look: 'pinboard',
    trustedPostersSkipApproval: false,
    closedAt: null,
  },
  posting,
  links: {
    post: 'https://2026.example.no/wall/post',
    wall: 'https://2026.example.no/wall',
    screen: 'https://2026.example.no/wall/screen',
  },
})

const posting = () => screen.getByRole('radiogroup', { name: 'Posting' })
const isWarning = (el: HTMLElement) => el.className.includes('text-amber-700')

describe('the Posting note (§7)', () => {
  it.each<[PostingState | 'saving', string, boolean]>([
    ['saving', 'Saving…', false],
    [
      'open',
      'Attendees can post. Posting closes by itself at the end of the conference’s last day.',
      false,
    ],
    ['paused', 'The posting page says the wall isn’t open for photos.', false],
    [
      'notYetOpen',
      'Posting opens by itself at 00:00 on the conference’s first day, and closes at the end of its last (Oslo time).',
      false,
    ],
    [
      'noStartDate',
      'Posting stays closed: the conference has no start date. Set one in Settings, or switch to Open.',
      true,
    ],
    [
      'datesReversed',
      'Posting stays closed: the conference’s last day is before its first. Fix the dates in Settings, or switch to Open.',
      true,
    ],
    ['ended', 'Posting has closed: the conference’s last day is over.', true],
    [
      'noEndDate',
      'Posting stays closed: the conference has no end date. Set one in Settings.',
      true,
    ],
    ['closed', 'This wall has closed, and its photos are being deleted.', true],
  ])('%s says %j (warning: %s)', (state, text, warn) => {
    render(
      <PhotoWallAdmin
        setup
        view={view(state === 'saving' ? 'open' : state)}
        onSetUp={() => {}}
        onChange={() => {}}
        {...(state === 'saving' && {
          saving: true,
          pending: { postingMode: 'open' as const },
        })}
      />,
    )
    expect(posting()).toHaveAccessibleDescription(text)
    const note = document.getElementById(
      posting().getAttribute('aria-describedby')!,
    )!
    expect(isWarning(note)).toBe(warn)
  })
})

describe('the Posting switch (§7, §10)', () => {
  it('offers Automatic, Open and Paused, each with its own mode', () => {
    render(
      <PhotoWallAdmin
        setup
        view={view('open')}
        onSetUp={() => {}}
        onChange={() => {}}
      />,
    )
    const radios = Array.from(
      posting().querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    )
    expect(radios.map((r) => [r.labels?.[0]?.textContent, r.value])).toEqual([
      ['Automatic', 'auto'],
      ['Open', 'open'],
      ['Paused', 'paused'],
    ])
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual([
      'auto',
    ])
  })

  it.each([
    ['Open', 'open'],
    ['Paused', 'paused'],
  ])('choosing %s asks for %s', (label, mode) => {
    const onChange = vi.fn()
    render(
      <PhotoWallAdmin
        setup
        view={view('open')}
        onSetUp={() => {}}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: label }))
    expect(onChange).toHaveBeenCalledWith({ postingMode: mode })
  })

  it('choosing Automatic asks for auto', () => {
    const onChange = vi.fn()
    const paused = view('paused')
    render(
      <PhotoWallAdmin
        setup
        view={{ ...paused, wall: { ...paused.wall!, postingMode: 'paused' } }}
        onSetUp={() => {}}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Automatic' }))
    expect(onChange).toHaveBeenCalledWith({ postingMode: 'auto' })
  })
})

describe('the Wall Look (§9, P3)', () => {
  const looks = () => screen.getByRole('radiogroup', { name: 'Wall Look' })

  it("offers Pinboard, Mosaic and Spotlight, the wall's look checked", () => {
    const v = view('open')
    render(
      <PhotoWallAdmin
        setup
        view={{ ...v, wall: { ...v.wall!, look: 'mosaic' } }}
        onSetUp={() => {}}
        onChange={() => {}}
      />,
    )
    const radios = Array.from(
      looks().querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    )
    expect(radios.map((r) => r.value)).toEqual([
      'pinboard',
      'mosaic',
      'spotlight',
    ])
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual([
      'mosaic',
    ])
  })

  it.each([
    ['Mosaic', 'mosaic'],
    ['Spotlight', 'spotlight'],
  ])('choosing %s asks for %s', (label, look) => {
    const onChange = vi.fn()
    render(
      <PhotoWallAdmin
        setup
        view={view('open')}
        onSetUp={() => {}}
        onChange={onChange}
      />,
    )
    fireEvent.click(
      within(looks()).getByRole('radio', { name: new RegExp(label) }),
    )
    expect(onChange).toHaveBeenCalledWith({ look })
  })
})

describe('the header posting status (§7, §10)', () => {
  const header = (
    v: PhotoWallAdminView,
    onChange: (c: object) => void = () => {},
  ) =>
    render(<PhotoWallAdmin view={v} onSetUp={() => {}} onChange={onChange} />)

  it.each<[PostingState, string, string | null]>([
    ['open', 'Posting: Open (automatic)', 'Pause posting'],
    ['paused', 'Posting: Paused', 'Open posting'],
    ['notYetOpen', 'Posting: Automatic, not open yet', 'Open posting'],
    ['ended', 'Posting: Closed', null],
    ['closed', 'Posting: Closed', null],
  ])('%s says %j', (state, text, action) => {
    header(view(state))
    expect(screen.getByText(text)).toBeInTheDocument()
    const buttons = screen
      .queryAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /posting$/.test(t ?? ''))
    expect(buttons).toEqual(action ? [action] : [])
  })

  it('says when an Automatic wall opens', () => {
    header({ ...view('notYetOpen'), opensOn: '2026-10-26' })
    expect(screen.getByText(/^Posting: Automatic, opens /)).toHaveTextContent(
      /26/,
    )
  })

  it('Pause asks for the same change as the Posting switch', () => {
    const onChange = vi.fn()
    header(view('open'), onChange)
    fireEvent.click(screen.getByRole('button', { name: 'Pause posting' }))
    expect(onChange).toHaveBeenCalledWith({ postingMode: 'paused' })
  })

  it('links to Setup, and shows the queue rather than the settings', () => {
    header(view('open'))
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/admin/photo-wall/setup',
    )
    expect(screen.queryByRole('radiogroup', { name: 'Posting' })).toBeNull()
  })
})
