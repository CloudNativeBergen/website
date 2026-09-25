import { CANVAS_SIZE } from './meme-generator-config'
import type { Frame, SceneTime } from './meme-generator-timeline'

/** Paints one scene at its own time — `drawDesign` with that scene's assets. */
export type PaintScene = (
  ctx: CanvasRenderingContext2D,
  scene: SceneTime,
) => void

/** Two offscreen canvases, one per scene of a transition. */
export interface Layers {
  outgoing: CanvasRenderingContext2D
  incoming: CanvasRenderingContext2D
}

/**
 * Paint one frame of the video. Scrubbing and playback both come here, so a
 * time shows the same picture however it was reached. A transition draws each
 * scene to its own layer and composites the pair — a scene never knows it is
 * in one. `layers` is only asked for when a frame needs them.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  paint: PaintScene,
  layers: () => Layers,
) {
  if (frame.kind === 'scene') {
    paint(ctx, { index: frame.index, time: frame.time })
    return
  }
  const { outgoing, incoming } = layers()
  paint(outgoing, frame.from)
  paint(incoming, frame.to)
  // A true cross-fade: each layer weighted by its share, and the two ADDED.
  // Painting the incoming layer over an opaque outgoing one would look the
  // same for opaque scenes, but a transparent incoming background would show
  // the outgoing scene through it until the window closed, then snap.
  ctx.save()
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.globalAlpha = 1 - frame.progress
  ctx.drawImage(outgoing.canvas, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = frame.progress
  ctx.drawImage(incoming.canvas, 0, 0)
  ctx.restore()
}

/** Two offscreen layers the size of the canvas, made on first use. */
export function offscreenLayers(): () => Layers {
  let layers: Layers | null = null
  const layer = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context for a transition layer')
    return ctx
  }
  return () => (layers ??= { outgoing: layer(), incoming: layer() })
}
