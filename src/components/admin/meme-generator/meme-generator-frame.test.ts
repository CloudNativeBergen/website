// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { drawFrame, type Layers } from './meme-generator-frame'
import { CANVAS_SIZE } from './meme-generator-config'
import type { SceneTime } from './meme-generator-timeline'

type Call = [string, ...unknown[]]

/** A 2D context recording calls and property writes, in order, into `log`. */
function recorder(name: string, log: Call[]) {
  const canvas = { name }
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, key) {
      if (key === 'canvas') return canvas
      return (...args: unknown[]) =>
        log.push([`${name}.${String(key)}`, ...args])
    },
    set(_target, key, value) {
      log.push([`${name}.${String(key)}=`, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

function setup() {
  const log: Call[] = []
  const main = recorder('main', log)
  const layers: Layers = {
    outgoing: recorder('outgoing', log),
    incoming: recorder('incoming', log),
  }
  const paint = vi.fn((ctx: CanvasRenderingContext2D, scene: SceneTime) =>
    log.push([
      'paint',
      (ctx.canvas as unknown as { name: string }).name,
      scene,
    ]),
  )
  return { log, main, layers, paint }
}

describe('drawFrame', () => {
  it('paints a lone scene straight onto the canvas, with no layers', () => {
    const { log, main, layers, paint } = setup()
    const getLayers = vi.fn(() => layers)

    drawFrame(main, { kind: 'scene', index: 1, time: 0.5 }, paint, getLayers)

    expect(log).toEqual([['paint', 'main', { index: 1, time: 0.5 }]])
    expect(getLayers).not.toHaveBeenCalled()
  })

  it('paints each scene of a fade to its own layer, then the incoming over the outgoing', () => {
    const { log, main, layers, paint } = setup()
    const from = { index: 0, time: 1.9 }
    const to = { index: 1, time: 0 }

    drawFrame(
      main,
      { kind: 'fade', from, to, progress: 0.25 },
      paint,
      () => layers,
    )

    expect(log).toEqual([
      ['paint', 'outgoing', from],
      ['paint', 'incoming', to],
      ['main.save'],
      ['main.clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['main.globalAlpha=', 1],
      ['main.drawImage', { name: 'outgoing' }, 0, 0],
      ['main.globalAlpha=', 0.25],
      ['main.drawImage', { name: 'incoming' }, 0, 0],
      ['main.restore'],
    ])
  })
})
