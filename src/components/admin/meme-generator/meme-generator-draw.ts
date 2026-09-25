import {
  CANVAS_SIZE,
  DEFAULT_BG_COLOR,
  DEFAULT_TEXT_LINES,
  LOGO_PADDING_DEFAULT,
  LOGO_SIZE_DEFAULT,
  QR_BACKGROUND_COLOR_DEFAULT,
  QR_DOTS_COLOR_DEFAULT,
  QR_HORIZONTAL_POSITION_DEFAULT,
  QR_SIZE_DEFAULT,
  QR_VERTICAL_POSITION_DEFAULT,
  type TextLine,
} from './meme-generator-config'
import type { CornerDotType, CornerSquareType, DotType } from 'qr-code-styling'
import { canvasFontShorthand, memeLineText } from './meme-generator-fonts'
import {
  drawLogo,
  isLightBackground,
  monochromeInk,
  placeLogo,
  type CanvasLogo,
  type LogoVariant,
} from './meme-generator-logo'
import {
  AT_REST,
  DRIFT_ZOOM,
  driftScale,
  elementStateAt,
  isAtRest,
  motionFor,
  type ElementId,
  type ElementState,
  type SceneMotion,
} from './meme-generator-motion'

/**
 * One meme-generator design, and the one function that draws it.
 *
 * `drawDesign` is pure: everything it paints comes from the design, its
 * already-decoded assets and a time. It never waits on anything — loading is
 * the editor's job — and never reads the document, so the same call can paint
 * the preview, a video frame, or a recording context in a unit test.
 */

/** What the QR generator is given; changing anything else never re-runs it. */
export interface QrStyle {
  url: string
  /** Drawn size in canvas pixels; the image is generated at twice this. */
  size: number
  dotsColor: string
  backgroundColor: string
  dotsType: DotType
  cornerSquareType: CornerSquareType
  cornerDotType: CornerDotType
}

export interface MemeDesign {
  background: {
    color: string
    /** An uploaded image, as a data URL, and the file's name for the UI. */
    image: { url: string; name: string } | null
  }
  textLines: TextLine[]
  logo: {
    size: number
    /** Distance of the logo box from the bottom edge, in canvas pixels. */
    bottom: number
    /** Distance of the logo box from the right edge, in canvas pixels. */
    right: number
    variant: LogoVariant
  }
  qr: QrStyle & {
    /** Centre, as a percentage of the canvas. */
    horizontalPosition: number
    verticalPosition: number
  }
}

export const DEFAULT_DESIGN: MemeDesign = {
  background: { color: DEFAULT_BG_COLOR, image: null },
  textLines: DEFAULT_TEXT_LINES,
  logo: {
    size: LOGO_SIZE_DEFAULT,
    bottom: LOGO_PADDING_DEFAULT,
    right: LOGO_PADDING_DEFAULT,
    variant: 'monochrome',
  },
  qr: {
    url: '',
    size: QR_SIZE_DEFAULT,
    dotsColor: QR_DOTS_COLOR_DEFAULT,
    backgroundColor: QR_BACKGROUND_COLOR_DEFAULT,
    dotsType: 'dots',
    cornerSquareType: 'rounded',
    cornerDotType: 'dot',
    horizontalPosition: QR_HORIZONTAL_POSITION_DEFAULT,
    verticalPosition: QR_VERTICAL_POSITION_DEFAULT,
  },
}

/** A decoded image that knows its own size. */
export type Raster = CanvasImageSource & { width: number; height: number }

/** A design's decoded assets. Anything missing is simply not drawn. */
export interface MemeAssets {
  /**
   * The design's background image, decoded — for a drifting scene, the copy
   * `prescaleForDrift` made of it, so no frame resamples the full photo.
   */
  background: Raster | null
  /** The QR image for the design's current QR style. */
  qr: CanvasImageSource | null
  logo: CanvasLogo | null
  /** The page's brand font and gradient, which the wordmark paints with. */
  brand: { fontFamily: string; gradient: [string, string] }
}

/**
 * Where a text line is anchored and how wide it may wrap. A centred line is
 * centred and padded on both sides; a left or right line starts at its
 * horizontal position and is padded on the far side only.
 */
export function textAnchor(
  line: Pick<TextLine, 'textAlign' | 'textPadding' | 'horizontalPosition'>,
): { x: number; maxWidth: number } {
  const padding = (line.textPadding / 100) * CANVAS_SIZE
  const offset = (line.horizontalPosition / 100) * CANVAS_SIZE
  switch (line.textAlign) {
    case 'left':
      return { x: offset, maxWidth: CANVAS_SIZE - offset - padding }
    case 'right':
      return {
        x: CANVAS_SIZE - offset,
        maxWidth: CANVAS_SIZE - offset - padding,
      }
    default:
      return { x: CANVAS_SIZE / 2, maxWidth: CANVAS_SIZE - padding * 2 }
  }
}

/** Greedy word wrap. A word wider than `maxWidth` gets a row of its own. */
export function wrapWords(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const rows: string[] = []
  let current = ''
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate) > maxWidth && current) {
      rows.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) rows.push(current)
  return rows
}

/**
 * Cover a `size`-pixel square with `image`, scaled to fill it and centred,
 * cropping the overflow — then `zoom` times larger again, about the centre.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: Raster,
  size: number,
  zoom: number,
) {
  const ratio = Math.max(size / image.width, size / image.height) * zoom
  const width = image.width * ratio
  const height = image.height * ratio
  ctx.drawImage(
    image,
    0,
    0,
    image.width,
    image.height,
    (size - width) / 2,
    (size - height) / 2,
    width,
    height,
  )
}

/** The side of a background pre-scaled for drift: its largest zoom, 1:1. */
export const DRIFT_RASTER_SIZE = Math.ceil(CANVAS_SIZE * (1 + DRIFT_ZOOM))

/**
 * A background cropped and scaled ONCE to the square a drift needs, so each
 * frame of a drift resamples a ~1200 px square rather than a multi-megapixel
 * photo. `canvas` is a fresh canvas to draw it into.
 */
export function prescaleForDrift(
  image: Raster,
  canvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  canvas.width = canvas.height = DRIFT_RASTER_SIZE
  const ctx = canvas.getContext('2d')
  // No context, no copy: a blank canvas would replace the photo.
  if (!ctx) return null
  drawCover(ctx, image, DRIFT_RASTER_SIZE, 1)
  return canvas
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  color: string,
  image: Raster | null,
  zoom: number,
) {
  if (!image) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    return
  }
  drawCover(ctx, image, CANVAS_SIZE, zoom)
}

/**
 * Draw with an element's state applied: its opacity, its offset, and its
 * scale about `centre`. Transforms what is drawn — never a font size. At rest
 * nothing is saved or set, so a still draws exactly as it always has.
 */
function withState(
  ctx: CanvasRenderingContext2D,
  state: ElementState,
  centre: { x: number; y: number },
  draw: () => void,
) {
  if (state.opacity <= 0) return
  if (isAtRest(state)) {
    draw()
    return
  }
  ctx.save()
  ctx.globalAlpha = state.opacity
  ctx.translate(centre.x, centre.y + state.offsetY)
  ctx.scale(state.scale, state.scale)
  ctx.translate(-centre.x, -centre.y)
  draw()
  ctx.restore()
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  line: TextLine,
  state: ElementState,
) {
  if (!line.text) return

  ctx.font = `${canvasFontShorthand(line)}, sans-serif`
  ctx.fillStyle = line.color
  ctx.textAlign = line.textAlign
  ctx.textBaseline = 'middle'

  // Wrapped at the line's own size, before any transform: a pop scales the
  // drawn rows and never re-measures them.
  const { x, maxWidth } = textAnchor(line)
  const rows = wrapWords(
    memeLineText(line),
    maxWidth,
    (text) => ctx.measureText(text).width,
  )

  const lineHeight = line.fontSize * 1.2
  const centreY = (line.verticalPosition / 100) * CANVAS_SIZE
  const startY = centreY - (rows.length * lineHeight) / 2 + lineHeight / 2

  const paint = () =>
    rows.forEach((row, index) => {
      const y = startY + index * lineHeight
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
      ctx.lineWidth = 2
      ctx.strokeText(row, x, y)
      ctx.fillText(row, x, y)
    })
  if (isAtRest(state)) {
    paint()
    return
  }
  // The block's centre: the anchor is its middle, left or right edge.
  const width = Math.max(...rows.map((row) => ctx.measureText(row).width))
  const centreX =
    line.textAlign === 'left'
      ? x + width / 2
      : line.textAlign === 'right'
        ? x - width / 2
        : x
  withState(ctx, state, { x: centreX, y: centreY }, paint)
}

/** A scene's motion and length: what `drawDesign` needs to animate it. */
export interface Animation {
  motion: SceneMotion
  /** The scene's length, in seconds. */
  duration: number
}

/**
 * Paint `design` at `time` seconds into its scene. With no `animation` it is a
 * still, every element at rest — Image mode, and a scene nobody animated.
 */
export function drawDesign(
  ctx: CanvasRenderingContext2D,
  design: MemeDesign,
  assets: MemeAssets,
  time: number,
  animation?: Animation,
) {
  const stateOf = (id: ElementId) =>
    animation
      ? elementStateAt(
          motionFor(animation.motion, id, animation.duration),
          time,
        )
      : AT_REST
  const zoom =
    animation?.motion.drift && assets.background
      ? driftScale(time, animation.duration)
      : 1

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  drawBackground(ctx, design.background.color, assets.background, zoom)

  design.textLines.forEach((line, index) =>
    drawTextLine(ctx, line, stateOf(`text${index}`)),
  )

  const { qr } = design
  if (qr.url && assets.qr) {
    const image = assets.qr
    const centre = {
      x: (qr.horizontalPosition / 100) * CANVAS_SIZE,
      y: (qr.verticalPosition / 100) * CANVAS_SIZE,
    }
    withState(ctx, stateOf('qr'), centre, () =>
      ctx.drawImage(
        image,
        centre.x - qr.size / 2,
        centre.y - qr.size / 2,
        qr.size,
        qr.size,
      ),
    )
  }

  // Last, so it sits on top of everything.
  if (assets.logo) {
    const logo = assets.logo
    const { size, bottom, right, variant } = design.logo
    const frame = placeLogo(logo, { size, bottom, right })
    const centre = {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
    }
    withState(ctx, stateOf('logo'), centre, () =>
      drawLogo(ctx, logo, frame, {
        variant,
        ink: monochromeInk(designIsLight(design)),
        ...assets.brand,
      }),
    )
  }
}

/** The logo's light-or-dark rule, which also picks the uploaded variant. */
export function designIsLight(design: MemeDesign): boolean {
  return isLightBackground({
    color: design.background.color,
    hasImage: design.background.image !== null,
  })
}
