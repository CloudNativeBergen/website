/**
 * The Spotlight walk against Up next at the moments its membership changes
 * (Photo Wall spec §9.2): a photo that loads late, a turn that ends on a
 * post only kept because it was featured, a big post removed after an
 * arrival pushed another out. Round-6 adversarial review (PR #1563).
 */
import { describe, expect, it } from 'vitest'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import { screenPostKey as key } from '@/lib/photo-wall/screen'
import { SWAP_EVERY_MS } from './board'
import {
  featured,
  initialStream,
  pendingStreamImages,
  streamReducer,
  upNext,
  type StreamState,
} from './stream'

const T0 = Date.parse('2026-10-26T09:00:00Z')
const post = (n: number): ScreenPost => ({
  _id: `p${n}`,
  src: `s${n}`,
  whole: { src: `w${n}`, width: 1600, height: 1000 },
  caption: null,
  name: null,
  approvedAt: new Date(T0 - n * 60_000).toISOString(), // p1 newest
})
const view = (posts: ScreenPost[]): ScreenView => ({
  closed: false,
  sponsorStrip: false,
  look: 'spotlight',
  posts,
})
const ids = (ps: ScreenPost[]) => ps.map((p) => p._id)
const s = (sec: number) => T0 + sec * 1000
const load = (st: StreamState, n: number, at: number) =>
  streamReducer(st, { type: 'imageLoaded', key: key(post(n)), now: at })
const fail = (st: StreamState, n: number, at: number) =>
  streamReducer(st, { type: 'imageFailed', key: key(post(n)), now: at })
const tick = (st: StreamState, at: number) =>
  streamReducer(st, { type: 'tick', now: at })

describe('adv6: Up next vs the walk at a handover', () => {
  it('a hidden 12th post returns at the handover and jumps the rail (deterministic)', () => {
    const list = Array.from({ length: 13 }, (_, i) => post(i + 1))
    let st = initialStream('spotlight')
    st = streamReducer(st, { type: 'poll', view: view(list), now: s(0) })
    expect(ids(pendingStreamImages(st))).toEqual(ids(list.slice(0, 12)))
    // Cold start on bad Wi-Fi: the newest fails, two of the oldest load first.
    st = fail(st, 1, s(0))
    st = load(st, 2, s(0))
    st = load(st, 13, s(0))
    expect(st.feature?.key).toBe(key(post(2)))
    st = tick(st, s(6)) // p13 is all there is besides p2
    expect(st.feature?.key).toBe(key(post(13)))
    st = load(st, 12, s(7))
    st = tick(st, s(12))
    expect(st.feature?.key).toBe(key(post(12)))
    for (let n = 3; n <= 11; n++) st = load(st, n, s(14))
    for (let t = 18, n = 3; n <= 11; t += 6, n++) {
      st = tick(st, s(t))
      expect(st.feature?.key, `t=${t}`).toBe(key(post(n)))
    }
    st = tick(st, s(72))
    expect(st.feature?.key).toBe(key(post(2)))
    st = tick(st, s(78))
    expect(st.feature?.key).toBe(key(post(13))) // the oldest shown is the big post
    // p1's retry lands (a poll ≥ 30 s after the failure re-asks it): a newer
    // post slides in; p13 is kept only because it is featured, p12 is hidden.
    st = streamReducer(st, { type: 'poll', view: view([...list]), now: s(79) })
    expect(ids(pendingStreamImages(st))).toContain('p1')
    st = load(st, 1, s(79))
    const rail = ids(upNext(st))
    expect(rail).toHaveLength(4)
    // Nothing else happens; the next four big posts:
    const seq: string[] = []
    for (let i = 0; i < 4; i++) {
      st = tick(st, st.feature!.at + SWAP_EVERY_MS)
      seq.push(featured(st)!._id)
    }
    expect(seq).toEqual(rail)
  })

  it('stable walk: no post twice before every other post of the walk had a turn', () => {
    const list = Array.from({ length: 12 }, (_, i) => post(i + 1))
    let st = initialStream('spotlight')
    st = streamReducer(st, { type: 'poll', view: view(list), now: s(0) })
    for (let n = 1; n <= 12; n++) st = load(st, n, s(0))
    const seq: string[] = [featured(st)!._id]
    for (let i = 0; i < 120; i++) {
      st = tick(st, st.feature!.at + SWAP_EVERY_MS)
      seq.push(featured(st)!._id)
    }
    for (let i = 0; i + 12 <= seq.length; i++)
      expect(new Set(seq.slice(i, i + 12)).size, `window ${i}`).toBe(12)
    expect(seq.slice(0, 12)).toEqual(ids(list)) // the quiet walk goes round the newest in order
  })

  it('turns is pruned to the list', () => {
    let list = Array.from({ length: 12 }, (_, i) => post(i + 1))
    let st = initialStream('spotlight')
    st = streamReducer(st, { type: 'poll', view: view(list), now: s(0) })
    for (let n = 1; n <= 12; n++) st = load(st, n, s(0))
    for (let i = 0; i < 12; i++) st = tick(st, st.feature!.at + SWAP_EVERY_MS)
    expect(Object.keys(st.turns)).toHaveLength(12)
    list = list.slice(0, 6)
    st = streamReducer(st, { type: 'poll', view: view(list), now: s(200) })
    expect(Object.keys(st.turns)).toHaveLength(6)
  })
})

describe('adv6: removed big post hands over to a post that was never on the rail', () => {
  it('an arrival pushes the 12th post out before its turn; the big post is then removed', () => {
    const A: ScreenPost = {
      ...post(0),
      _id: 'A',
      approvedAt: new Date(s(61)).toISOString(),
    }
    const list = Array.from({ length: 13 }, (_, i) => post(i + 1))
    let st = initialStream('spotlight')
    st = streamReducer(st, { type: 'poll', view: view(list), now: s(0) })
    for (let n = 1; n <= 12; n++) st = load(st, n, s(0))
    for (let t = 6; t <= 60; t += 6) st = tick(st, s(t)) // p1..p11 had a turn, p12 not yet
    expect(featured(st)!._id).toBe('p11')
    // An approval lands and loads: next in line.
    st = streamReducer(st, {
      type: 'poll',
      view: view([A, ...list]),
      now: s(61),
    })
    st = streamReducer(st, { type: 'imageLoaded', key: key(A), now: s(61) })
    st = tick(st, s(66))
    expect(featured(st)!._id).toBe('A')
    st = tick(st, s(72))
    expect(featured(st)!._id).toBe('p1')
    const rail = ids(upNext(st))
    expect(rail).toEqual(['p2', 'p3', 'p4', 'p5'])
    // The organizer removes the big post.
    st = streamReducer(st, {
      type: 'poll',
      view: view([A, ...list.filter((p) => p._id !== 'p1')]),
      now: s(73),
    })
    expect(featured(st)!._id).toBe(rail[0])
  })
})
