/**
 * @vitest-environment node
 *
 * The page's own guards (speaker feedback spec §7.1): a failed conference
 * read is not an unknown host, an unknown host is a 404, and a failed index
 * read is never shown as an invalid code. The resolver itself is covered by
 * `src/lib/feedback/attendee.groq.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  resolution: {} as Record<string, unknown>,
  resolve: vi.fn(),
  submit: vi.fn(),
  remove: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({ notFound: h.notFound }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))
vi.mock('@/lib/feedback/server', () => ({
  resolveAttendeeState: h.resolve,
  submitFeedback: h.submit,
  deleteFeedback: h.remove,
  deviceCookie: () => ({ name: 'konf_feedback', options: {} }),
}))
vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
import { beginRequest, presentCookie } from '../../helpers/nextHeadersJar'

import FeedbackCodePage from '@/app/(public)/f/[code]/page'

const CONFERENCE = { _id: 'conf-A', title: 'Conf A', endDate: '2026-10-27' }
const render = (code = 'k7m2qx', search: Record<string, string> = {}) =>
  FeedbackCodePage({
    params: Promise.resolve({ code }),
    searchParams: Promise.resolve(search),
  })

beforeEach(() => {
  vi.clearAllMocks()
  beginRequest()
  h.resolution = { conference: CONFERENCE, status: 'resolved' }
  h.resolve.mockResolvedValue({ state: 'unknown' })
})

describe('/f/[code]', () => {
  it('renders for the programme sheet only on embed=1, on every branch', async () => {
    expect((await render()).props.embedded).toBe(false)
    expect((await render('k7m2qx', { embed: 'true' })).props.embedded).toBe(
      false,
    )
    expect((await render('k7m2qx', { embed: '1' })).props.embedded).toBe(true)
    h.resolution = { conference: {}, status: 'unavailable' }
    expect((await render('k7m2qx', { embed: '1' })).props.embedded).toBe(true)
  })

  it('shows Unavailable when the conference read failed, and reads no code', async () => {
    h.resolution = { conference: {}, status: 'unavailable' }
    const element = await render()
    expect(element.props.page).toEqual({ state: 'unavailable' })
    // No conference read, so no logo: never another brand on this domain.
    expect(element.props.logo).toBeNull()
    expect(h.resolve).not.toHaveBeenCalled()
  })

  it('is a 404 on a host no conference claims, and reads no code', async () => {
    h.resolution = { conference: {}, status: 'not-found' }
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(h.resolve).not.toHaveBeenCalled()
  })

  it('resolves the code against the HOST’s conference, with this device’s cookie', async () => {
    presentCookie('konf_feedback', 'signed-cookie')
    h.resolve.mockResolvedValue({
      state: 'closed',
      talk: null,
      canDelete: true,
    })
    const element = await render('ABC234')
    expect(h.resolve).toHaveBeenCalledWith({
      conference: CONFERENCE,
      code: 'ABC234',
      cookie: 'signed-cookie',
      now: expect.any(Date),
    })
    // `now` is the request's time, not a fixed or cached instant.
    const { now } = h.resolve.mock.calls[0][0] as { now: Date }
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(5_000)
    expect(element.props.page).toEqual({
      state: 'closed',
      talk: null,
      canDelete: true,
    })
    expect(element.props.logo).toMatchObject({ title: 'Conf A' })
  })

  it('passes no cookie when the browser sent none', async () => {
    await render()
    expect(h.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: undefined }),
    )
  })

  it('shows Unavailable, never Unknown, when the index read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.resolve.mockRejectedValue(new Error('Sanity down'))
    const element = await render()
    expect(element.props.page).toEqual({ state: 'unavailable' })
  })
})

describe('/f/[code] Submit', () => {
  it('is bound to the page’s own code: the client sends only the colour', async () => {
    h.resolve.mockResolvedValue({ state: 'open', talk: null, closesAt: null })
    h.submit.mockResolvedValue({
      outcome: { state: 'answered', colour: 'red' },
    })
    const element = await render('ABC234')

    expect(await element.props.submit('red')).toEqual({
      state: 'answered',
      colour: 'red',
    })
    expect(h.submit).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABC234', colour: 'red' }),
    )
  })

  it('sends the comment with the colour', async () => {
    h.submit.mockResolvedValue({ outcome: { state: 'unavailable' } })
    const element = await render('ABC234')
    await element.props.submit('green', ' nice ')
    expect(h.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ABC234',
        colour: 'green',
        comment: ' nice ',
      }),
    )
  })
})

describe('/f/[code] Delete my answer', () => {
  it('is bound to the page’s own code: the client sends nothing', async () => {
    h.remove.mockResolvedValue({
      outcome: {
        deleted: true,
        page: { state: 'closed', talk: null, canDelete: false },
      },
    })
    const element = await render('ABC234')
    expect(await element.props.remove()).toEqual({
      deleted: true,
      page: { state: 'closed', talk: null, canDelete: false },
    })
    expect(h.remove).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABC234' }),
    )
  })
})

describe('/f/[code] metadata', () => {
  it('is never indexed and never sends the code on as a referrer', async () => {
    const { metadata } = await import('@/app/(public)/f/[code]/page')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
  })
})
