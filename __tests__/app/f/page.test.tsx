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
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({ notFound: h.notFound }))
vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))
vi.mock('@/lib/feedback/server', () => ({ resolveFeedbackPage: h.resolve }))

import FeedbackCodePage from '@/app/(public)/f/[code]/page'

const CONFERENCE = { _id: 'conf-A', title: 'Conf A', endDate: '2026-10-27' }
const render = (code = 'k7m2qx') =>
  FeedbackCodePage({ params: Promise.resolve({ code }) })

beforeEach(() => {
  vi.clearAllMocks()
  h.resolution = { conference: CONFERENCE, status: 'resolved' }
  h.resolve.mockResolvedValue({ state: 'unknown' })
})

describe('/f/[code]', () => {
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

  it('resolves the code against the HOST’s conference', async () => {
    h.resolve.mockResolvedValue({ state: 'closed', talk: null })
    const element = await render('ABC234')
    expect(h.resolve).toHaveBeenCalledWith(
      CONFERENCE,
      'ABC234',
      expect.any(Date),
    )
    // `now` is the request's time, not a fixed or cached instant.
    const now = h.resolve.mock.calls[0][2] as Date
    expect(Math.abs(now.getTime() - Date.now())).toBeLessThan(5_000)
    expect(element.props.page).toEqual({ state: 'closed', talk: null })
    expect(element.props.logo).toMatchObject({ title: 'Conf A' })
  })

  it('shows Unavailable, never Unknown, when the index read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.resolve.mockRejectedValue(new Error('Sanity down'))
    const element = await render()
    expect(element.props.page).toEqual({ state: 'unavailable' })
  })
})

describe('/f/[code] metadata', () => {
  it('is never indexed and never sends the code on as a referrer', async () => {
    const { metadata } = await import('@/app/(public)/f/[code]/page')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
  })
})
