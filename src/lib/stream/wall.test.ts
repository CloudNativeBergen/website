import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conference } from '@/lib/conference/types'
import type { ScreenView } from '@/lib/photo-wall/screen'

const h = vi.hoisted(() => ({
  readScreenPage: vi.fn<() => Promise<ScreenView | null>>(),
}))
vi.mock('@/lib/photo-wall/screen-page', () => ({
  readScreenPage: h.readScreenPage,
}))

import { readStreamWall } from './wall'

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  domains: ['2026.cloudnativedays.no'],
} as Conference

const VIEW: ScreenView = {
  closed: false,
  sponsorStrip: true,
  look: 'mosaic',
  posts: [],
}

beforeEach(() => {
  h.readScreenPage.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readStreamWall', () => {
  it("is the cached wall's screen view, with the Composer link on the conference's domain", async () => {
    h.readScreenPage.mockResolvedValue(VIEW)
    const wall = await readStreamWall(conference, [], 'spotlight')
    expect(h.readScreenPage).toHaveBeenCalledWith('conf-1')
    expect(wall).toMatchObject({
      initial: VIEW,
      look: 'spotlight',
      conference: {
        postUrl: 'https://2026.cloudnativedays.no/wall/post',
        sponsors: [],
      },
    })
  })

  it('starts from a closed wall for a conference without one, so the screen polls until it is made', async () => {
    h.readScreenPage.mockResolvedValue(null)
    const wall = await readStreamWall(conference, [], undefined)
    expect(wall.initial).toEqual({
      closed: true,
      sponsorStrip: false,
      look: 'pinboard',
      posts: [],
    })
    expect(wall.conference.postUrl).toBe(
      'https://2026.cloudnativedays.no/wall/post',
    )
  })

  it('starts from a closed wall when the read fails, so the next poll can bring it in', async () => {
    h.readScreenPage.mockRejectedValue(new Error('Sanity is down'))
    const wall = await readStreamWall(conference, [], 'mosaic')
    expect(wall.initial.closed).toBe(true)
    expect(wall.look).toBe('mosaic')
  })
})
