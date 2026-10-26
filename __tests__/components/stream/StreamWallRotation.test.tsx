/**
 * @vitest-environment jsdom
 *
 * A room screen with the Photo Wall in turns (`/stream/<room>?wall=1`): the
 * real Screen Mode poll behind the real tRPC client, with only `fetch`
 * answering, and fake timers for the clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { inScreenMode, markScreenMode } from '@/components/pwa/screen-update'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import type { ScreenView } from '@/lib/photo-wall/screen'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { ROOM_TURN_MS, WALL_TURN_MS } from '@/lib/stream/wall-rotation'

const h = vi.hoisted(() => ({
  answer: vi.fn<() => unknown>(),
}))
// `qrcode` draws on a canvas jsdom does not have.
vi.mock('@/components/feedback/useFeedbackQrPng', () => ({
  useFeedbackQrPng: () => ({ src: 'data:image/png;base64,qr', failed: false }),
}))

// A wall that throws while it renders an answer whose look is `crash`.
vi.mock('@/components/photo-wall', async (importOriginal) => {
  const { createElement } = await import('react')
  const original =
    await importOriginal<typeof import('@/components/photo-wall')>()
  return {
    ...original,
    ScreenBoard: (props: Parameters<typeof original.ScreenBoard>[0]) => {
      if ((props.poll.data?.look as string) === 'crash') {
        throw new Error('The wall failed to render')
      }
      return createElement(original.ScreenBoard, props)
    },
  }
})

const screenFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost')
  if (!url.pathname.endsWith('/photoWallPublic.screen')) {
    throw new Error(`unexpected request ${url.pathname}`)
  }
  const answer = h.answer()
  if (answer instanceof TrpcError) {
    const { code, httpStatus } = answer
    return new Response(
      JSON.stringify({
        error: { message: code, code: -32000, data: { code, httpStatus } },
      }),
      { status: httpStatus, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(JSON.stringify({ result: { data: answer } }), {
    headers: { 'content-type': 'application/json' },
  })
})

/** What the server answers with a tRPC error. */
class TrpcError {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {}
}
/** The wall was deleted (or the conference could not be read). */
const NOT_FOUND = new TrpcError('NOT_FOUND', 404)
const SERVER_ERROR = new TrpcError('INTERNAL_SERVER_ERROR', 500)

import { StreamWallRotation } from '@/components/stream/StreamWallRotation'

const view = (fields: Partial<ScreenView> = {}): ScreenView => ({
  closed: false,
  sponsorStrip: false,
  look: 'pinboard',
  posts: [],
  ...fields,
})

const logo = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40"/></svg>`
const sponsor = (_id: string, name: string): ConferenceSponsor => ({
  sponsor: { _id, name, website: `https://${_id}.example`, logo },
  tier: { title: 'Partner', tagline: '' },
})
const SPONSORS = [sponsor('sopra', 'Sopra Steria'), sponsor('bekk', 'Bekk')]

const slot = (startTime: string, endTime: string): TrackTalk => ({
  startTime,
  endTime,
  placeholder: 'Session',
})
const schedules = (
  talks: TrackTalk[] = [slot('12:00', '12:40')],
  sponsorRef?: string,
): ConferenceSchedule[] => [
  {
    _id: '2026-10-27',
    date: '2026-10-27',
    tracks: [
      {
        trackTitle: 'Sopra Steria - Galleriet',
        trackDescription: '',
        talks,
        sponsor: sponsorRef ? { _ref: sponsorRef } : null,
      },
    ],
  },
]

function mount(initial: ScreenView, days: ConferenceSchedule[] = schedules()) {
  h.answer.mockReturnValue(initial)
  render(
    <TRPCProvider>
      <StreamWallRotation
        schedules={days}
        roomTrackTitle="Sopra Steria - Galleriet"
        sponsors={SPONSORS}
        wall={{
          initial,
          conference: {
            logo: { title: 'Cloud Native Days Norway' },
            postUrl: 'https://2026.example.no/wall/post',
            sponsors: SPONSORS,
          },
        }}
      >
        <p>Room view</p>
      </StreamWallRotation>
    </TRPCProvider>,
  )
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const wallShown = () =>
  screen.getByTestId('stream-wall').hasAttribute('data-shown')
const roomInert = () =>
  screen.getByText('Room view').parentElement!.hasAttribute('inert')

beforeEach(() => {
  vi.useFakeTimers()
  // Local time: the screen reads the talk times on its own clock.
  vi.setSystemTime(new Date('2026-10-27T09:00:00'))
  h.answer.mockReset()
  vi.stubGlobal('fetch', screenFetch)
  // The tRPC logger reports every failed poll; some tests fail polls on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  markScreenMode(null)
  vi.useRealTimers()
})

describe('StreamWallRotation', () => {
  it('shows the room view for 60 s, the wall for 30 s, and the room again', async () => {
    mount(view())
    await advance(0)
    expect(wallShown()).toBe(false)
    expect(screen.getByTestId('stream-wall')).toHaveAttribute('inert')
    await advance(ROOM_TURN_MS - 1_000)
    expect(wallShown()).toBe(false)
    await advance(1_000)
    expect(wallShown()).toBe(true)
    expect(roomInert()).toBe(true)
    expect(screen.getByTestId('stream-wall')).not.toHaveAttribute('inert')
    // An open wall with no photos still takes its turn, with the invitation.
    expect(screen.getByText('Be the first on the wall')).toBeInTheDocument()
    await advance(WALL_TURN_MS)
    expect(wallShown()).toBe(false)
    expect(roomInert()).toBe(false)
  })

  it('does not make the room page a Screen Mode page, which reloads itself on a deploy', async () => {
    mount(view())
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(true)
    expect(inScreenMode()).toBe(false)
  })

  it('skips the wall while it is closed, and takes the turn once it opens', async () => {
    mount(view({ closed: true }))
    await advance(ROOM_TURN_MS * 2)
    expect(wallShown()).toBe(false)
    h.answer.mockReturnValue(view())
    await advance(6_000)
    expect(wallShown()).toBe(true)
  })

  it('leaves the wall as soon as a poll says it closed', async () => {
    mount(view())
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(true)
    h.answer.mockReturnValue(view({ closed: true }))
    await advance(6_000)
    expect(wallShown()).toBe(false)
  })

  it('skips the wall once a poll says it is gone, and takes it back when it returns', async () => {
    mount(view())
    h.answer.mockReturnValue(NOT_FOUND)
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(false)
    h.answer.mockReturnValue(view())
    await advance(6_000)
    expect(wallShown()).toBe(true)
  })

  it('takes turns once a wall that did not exist when the page loaded is made', async () => {
    mount(view({ closed: true }))
    h.answer.mockReturnValue(NOT_FOUND)
    await advance(ROOM_TURN_MS * 2)
    expect(wallShown()).toBe(false)
    h.answer.mockReturnValue(view())
    await advance(6_000)
    expect(wallShown()).toBe(true)
  })

  it('stays off a gone wall through a later poll that failed for another reason', async () => {
    mount(view())
    h.answer.mockReturnValue(NOT_FOUND)
    await advance(6_000)
    h.answer.mockReturnValue(SERVER_ERROR)
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(false)
  })

  it('keeps taking turns through a poll that failed for another reason', async () => {
    mount(view())
    h.answer.mockReturnValue(SERVER_ERROR)
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(true)
  })

  it('drops the wall when it fails to render, and tries it again with the next answer', async () => {
    mount(view())
    h.answer.mockReturnValue(view({ look: 'crash' as ScreenView['look'] }))
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(false)
    h.answer.mockReturnValue(view())
    await advance(6_000)
    expect(wallShown()).toBe(true)
    expect(screen.getByText('Be the first on the wall')).toBeInTheDocument()
  })

  it('holds the room view in the five minutes before the next talk, then resumes', async () => {
    vi.setSystemTime(new Date('2026-10-27T09:54:30'))
    mount(view(), schedules([slot('10:00', '10:40')]))
    // 09:55:30: the room's turn is over, but the talk is 4.5 min away.
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(false)
    // 10:00: the talk has started; the room view still gets its 60 s.
    await advance(4.5 * 60_000)
    expect(wallShown()).toBe(false)
    await advance(ROOM_TURN_MS)
    expect(wallShown()).toBe(true)
  })

  it("thanks a sponsored room's track sponsor alone on the wall", async () => {
    mount(view({ sponsorStrip: true }), schedules(undefined, 'sopra'))
    await advance(ROOM_TURN_MS)
    const strip = screen.getByRole('region', { name: 'Track sponsored by' })
    expect(within(strip).getByText('Sopra Steria')).toBeInTheDocument()
    expect(screen.queryByRole('marquee')).toBeNull()
  })

  it('shows the usual sponsor strip in a room without a track sponsor', async () => {
    mount(view({ sponsorStrip: true }))
    await advance(ROOM_TURN_MS)
    expect(screen.getByRole('marquee')).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Track sponsored by' }),
    ).toBeNull()
  })
})
