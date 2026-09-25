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

  it('paints each scene of a fade to its own layer, then adds them, weighted', () => {
    const { log, main, layers, paint } = setup()
    const from = { index: 0, time: 1.9 }
    const to = { index: 1, time: 0 }

    drawFrame(
      main,
      { kind: 'transition', style: 'fade', from, to, progress: 0.25 },
      paint,
      () => layers,
    )

    expect(log).toEqual([
      ['paint', 'outgoing', from],
      ['paint', 'incoming', to],
      ['main.save'],
      ['main.clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['main.globalAlpha=', 0.75],
      ['main.drawImage', { name: 'outgoing' }, 0, 0],
      ['main.globalCompositeOperation=', 'lighter'],
      ['main.globalAlpha=', 0.25],
      ['main.drawImage', { name: 'incoming' }, 0, 0],
      ['main.restore'],
    ])
  })

  it('slides the incoming scene in from the right, pushing the outgoing one out', () => {
    const { log, main, layers, paint } = setup()
    const from = { index: 0, time: 1.9 }
    const to = { index: 1, time: 0 }

    drawFrame(
      main,
      { kind: 'transition', style: 'slide', from, to, progress: 0.25 },
      paint,
      () => layers,
    )

    const quarter = CANVAS_SIZE / 4
    expect(log).toEqual([
      ['paint', 'outgoing', from],
      ['paint', 'incoming', to],
      ['main.save'],
      ['main.clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['main.drawImage', { name: 'outgoing' }, -quarter, 0],
      ['main.drawImage', { name: 'incoming' }, CANVAS_SIZE - quarter, 0],
      ['main.restore'],
    ])
  })

  it('zooms through: the outgoing scene grows as it fades, the incoming settles from large', () => {
    const { log, main, layers, paint } = setup()
    const from = { index: 0, time: 1.9 }
    const to = { index: 1, time: 0 }

    drawFrame(
      main,
      { kind: 'transition', style: 'zoom', from, to, progress: 0.5 },
      paint,
      () => layers,
    )

    // Halfway, both are drawn at 1.1× about the centre: never under the
    // canvas's size, so no edge of either shows.
    const size = CANVAS_SIZE * 1.1
    const offset = (CANVAS_SIZE - size) / 2
    expect(log).toEqual([
      ['paint', 'outgoing', from],
      ['paint', 'incoming', to],
      ['main.save'],
      ['main.clearRect', 0, 0, CANVAS_SIZE, CANVAS_SIZE],
      ['main.globalAlpha=', 0.5],
      ['main.drawImage', { name: 'outgoing' }, offset, offset, size, size],
      ['main.globalCompositeOperation=', 'lighter'],
      ['main.globalAlpha=', 0.5],
      ['main.drawImage', { name: 'incoming' }, offset, offset, size, size],
      ['main.restore'],
    ])
  })

  it('starts a zoom on the outgoing scene alone, full size, and ends on the incoming one', () => {
    const at = (progress: number) => {
      const { log, main, layers, paint } = setup()
      drawFrame(
        main,
        {
          kind: 'transition',
          style: 'zoom',
          from: { index: 0, time: 1 },
          to: { index: 1, time: 0 },
          progress,
        },
        paint,
        () => layers,
      )
      return log.filter(([call]) => call === 'main.drawImage')
    }
    expect(at(0)[0]).toEqual(['main.drawImage', { name: 'outgoing' }, 0, 0])
    expect(at(1)[1]).toEqual(['main.drawImage', { name: 'incoming' }, 0, 0])
  })
})
