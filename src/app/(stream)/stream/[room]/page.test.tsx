/**
 * @vitest-environment node
 *
 * The room screen's link decides whether the Photo Wall takes turns with
 * the room view: `?wall=1` reads the wall and wraps the room view in the
 * rotation, `&look=` reaches the wall, and without the parameter the wall
 * is never read and the page is the room view alone.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  readStreamWall: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-1',
      sponsors: [],
      schedules: [
        {
          _id: '2026-10-27',
          date: '2026-10-27',
          tracks: [
            { trackTitle: 'Hovedsalen', trackDescription: '', talks: [] },
          ],
        },
      ],
    },
    error: null,
  }),
}))
vi.mock('@/lib/stream/wall', () => ({ readStreamWall: h.readStreamWall }))

import { StreamWallRotation } from '@/components/stream/StreamWallRotation'
import StreamRoomPage from './page'

const WALL = { initial: { closed: false }, conference: {}, look: undefined }

const open = (query: Record<string, string | string[]> = {}) =>
  StreamRoomPage({
    params: Promise.resolve({ room: 'Hovedsalen' }),
    searchParams: Promise.resolve(query),
  })

/** Every element of the rendered tree, depth first. */
function elementsOf(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement(node)) return []
  const { children } = node.props as { children?: ReactNode }
  return [node, ...elementsOf(children)]
}
const rotationIn = (node: ReactNode) =>
  elementsOf(node).find((element) => element.type === StreamWallRotation)

beforeEach(() => {
  h.readStreamWall.mockReset()
  h.readStreamWall.mockResolvedValue(WALL)
})

describe('/stream/[room]', () => {
  it('shows the room view alone, with no wall read, without ?wall=1', async () => {
    expect(rotationIn(await open())).toBeUndefined()
    expect(rotationIn(await open({ wall: '0' }))).toBeUndefined()
    expect(h.readStreamWall).not.toHaveBeenCalled()
  })

  it('wraps the room view in the rotation with ?wall=1, passing the look on', async () => {
    const rotation = rotationIn(await open({ wall: '1', look: 'spotlight' }))
    expect(rotation?.props).toMatchObject({
      wall: WALL,
      roomTrackTitle: 'Hovedsalen',
    })
    expect(h.readStreamWall).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conf-1' }),
      [],
      'spotlight',
    )
  })

  it('ignores a look that is not one', async () => {
    await open({ wall: '1', look: 'disco' })
    expect(h.readStreamWall).toHaveBeenCalledWith(
      expect.anything(),
      [],
      undefined,
    )
  })

  it('shows the room view alone when the conference has no wall', async () => {
    h.readStreamWall.mockResolvedValue(null)
    expect(rotationIn(await open({ wall: '1' }))).toBeUndefined()
  })
})
