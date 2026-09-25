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
  const p = frame.progress
  ctx.save()
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  if (frame.style === 'slide') {
    // The incoming scene pushes the outgoing one out to the left. Opaque on
    // opaque, so a plain paint of each is the whole picture.
    ctx.drawImage(outgoing.canvas, -p * CANVAS_SIZE, 0)
    ctx.drawImage(incoming.canvas, (1 - p) * CANVAS_SIZE, 0)
  } else if (frame.style === 'zoom') {
    // A cross-fade through a zoom: the outgoing scene grows as it goes, the
    // incoming one settles from large. Neither is ever drawn smaller than
    // the canvas, so no edge of either shows.
    crossFade(ctx, outgoing, incoming, p, 1 + ZOOM * p, 1 + ZOOM * (1 - p))
  } else {
    crossFade(ctx, outgoing, incoming, p, 1, 1)
  }
  ctx.restore()
}

/** How much larger than the canvas a zoom draws a scene at its far end. */
const ZOOM = 0.2

/**
 * A true cross-fade: each layer weighted by its share, and the two ADDED.
 * Painting the incoming layer over an opaque outgoing one would look the same
 * for opaque scenes, but a transparent incoming background would show the
 * outgoing scene through it until the window closed, then snap.
 */
function crossFade(
  ctx: CanvasRenderingContext2D,
  outgoing: CanvasRenderingContext2D,
  incoming: CanvasRenderingContext2D,
  progress: number,
  outgoingScale: number,
  incomingScale: number,
) {
  ctx.globalAlpha = 1 - progress
  drawScaled(ctx, outgoing.canvas, outgoingScale)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = progress
  drawScaled(ctx, incoming.canvas, incomingScale)
}

/** A layer drawn at `scale` about the canvas's centre. */
function drawScaled(
  ctx: CanvasRenderingContext2D,
  layer: CanvasImageSource,
  scale: number,
) {
  if (scale === 1) {
    ctx.drawImage(layer, 0, 0)
    return
  }
  const size = CANVAS_SIZE * scale
  const offset = (CANVAS_SIZE - size) / 2
  ctx.drawImage(layer, offset, offset, size, size)
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
