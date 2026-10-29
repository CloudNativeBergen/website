/**
 * @vitest-environment node
 *
 * `/program/<talkId>/feedback`, the programme's "Give feedback" link (#1472).
 * The lookup itself (which talks get a code) is proven on executed GROQ in
 * `attendee.groq.test.ts`; this pins what the route does with its answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeShortCode } from '@/lib/marketing/short-code'

const getConferenceForCurrentDomain = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => getConferenceForCurrentDomain(),
}))

const feedbackCodeForTalk = vi.fn()
vi.mock('@/lib/feedback/server', () => ({
  feedbackCodeForTalk: (...args: unknown[]) => feedbackCodeForTalk(...args),
}))

import { UNKNOWN_FEEDBACK_PATH } from '@/lib/feedback/url'
import { GET } from './route'

const HOST = 'https://cloudnativebergen.dev'
const CONFERENCE = {
  _id: 'conf-1',
  endDate: '2026-10-27',
  programDate: '2026-08-01',
}

const get = (talkId: string, search = '') =>
  GET(new Request(`${HOST}/program/${talkId}/feedback${search}`) as never, {
    params: Promise.resolve({ talkId }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceForCurrentDomain.mockResolvedValue({
    conference: CONFERENCE,
    error: null,
    status: 'resolved',
  })
  feedbackCodeForTalk.mockResolvedValue('k7m2qx')
})

describe('GET /program/<talkId>/feedback', () => {
  it("302s to the talk's current attendee page, on the host that was asked", async () => {
    const response = await get('talk-1')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${HOST}/f/k7m2qx`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(feedbackCodeForTalk).toHaveBeenCalledWith(
      CONFERENCE,
      'talk-1',
      expect.any(Date),
    )
  })

  it('sends every refusal to the one generic Unknown page', async () => {
    feedbackCodeForTalk.mockResolvedValue(null)
    const response = await get('talk-1')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `${HOST}${UNKNOWN_FEEDBACK_PATH}`,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it("keeps the programme sheet's embed flag, and nothing else, on both targets", async () => {
    const response = await get('talk-1', '?embed=1&utm_source=x')
    expect(response.headers.get('location')).toBe(`${HOST}/f/k7m2qx?embed=1`)

    feedbackCodeForTalk.mockResolvedValue(null)
    const refused = await get('talk-1', '?embed=1')
    expect(refused.headers.get('location')).toBe(
      `${HOST}${UNKNOWN_FEEDBACK_PATH}?embed=1`,
    )
  })

  it('drops an embed flag that is not exactly 1', async () => {
    const response = await get('talk-1', '?embed=yes')
    expect(response.headers.get('location')).toBe(`${HOST}/f/k7m2qx`)
  })

  it('lands that refusal on a path the attendee page reads as malformed (Unknown, no lookup)', () => {
    const [, f, segment, ...rest] = UNKNOWN_FEEDBACK_PATH.split('/')
    expect(f).toBe('f')
    expect(rest).toEqual([])
    expect(normalizeShortCode(segment)).toBeNull()
  })

  it('404s on a Host no conference claims, without a lookup', async () => {
    getConferenceForCurrentDomain.mockResolvedValue({
      conference: {},
      error: new Error('not found'),
      status: 'not-found',
    })
    const response = await get('talk-1')

    expect(response.status).toBe(404)
    expect(feedbackCodeForTalk).not.toHaveBeenCalled()
  })

  it('answers a failed read with 503, never with Unknown, which would call a valid code invalid', async () => {
    getConferenceForCurrentDomain.mockResolvedValue({
      conference: {},
      error: new Error('Sanity down'),
      status: 'unavailable',
    })
    const unavailable = await get('talk-1')
    expect(unavailable.status).toBe(503)
    expect(feedbackCodeForTalk).not.toHaveBeenCalled()

    getConferenceForCurrentDomain.mockResolvedValue({
      conference: CONFERENCE,
      error: null,
      status: 'resolved',
    })
    feedbackCodeForTalk.mockRejectedValue(new Error('index read failed'))
    const thrown = await get('talk-1')
    expect(thrown.status).toBe(503)
    expect(thrown.headers.get('cache-control')).toBe('no-store')
    expect(thrown.headers.get('location')).toBeNull()
  })
})
