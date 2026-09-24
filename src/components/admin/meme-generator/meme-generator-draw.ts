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
  /** The design's background image, decoded. */
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

function drawBackground(
  ctx: CanvasRenderingContext2D,
  color: string,
  image: Raster | null,
) {
  if (!image) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    return
  }
  // Cover: scale to fill the square, centred, cropping the overflow.
  const ratio = Math.max(CANVAS_SIZE / image.width, CANVAS_SIZE / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  ctx.drawImage(
    image,
    0,
    0,
    image.width,
    image.height,
    (CANVAS_SIZE - width) / 2,
    (CANVAS_SIZE - height) / 2,
    width,
    height,
  )
}

function drawTextLine(ctx: CanvasRenderingContext2D, line: TextLine) {
  if (!line.text) return

  ctx.font = `${canvasFontShorthand(line)}, sans-serif`
  ctx.fillStyle = line.color
  ctx.textAlign = line.textAlign
  ctx.textBaseline = 'middle'

  const { x, maxWidth } = textAnchor(line)
  const rows = wrapWords(
    memeLineText(line),
    maxWidth,
    (text) => ctx.measureText(text).width,
  )

  const lineHeight = line.fontSize * 1.2
  const startY =
    (line.verticalPosition / 100) * CANVAS_SIZE -
    (rows.length * lineHeight) / 2 +
    lineHeight / 2

  rows.forEach((row, index) => {
    const y = startY + index * lineHeight
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.lineWidth = 2
    ctx.strokeText(row, x, y)
    ctx.fillText(row, x, y)
  })
}

/**
 * Paint `design` at time `time` (seconds). Time is not used yet: every design
 * is a still until scenes and element animation arrive.
 */
export function drawDesign(
  ctx: CanvasRenderingContext2D,
  design: MemeDesign,
  assets: MemeAssets,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the frame's time; read once element animation lands (#1176)
  time: number,
) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  drawBackground(ctx, design.background.color, assets.background)

  for (const line of design.textLines) drawTextLine(ctx, line)

  const { qr } = design
  if (qr.url && assets.qr) {
    const x = (qr.horizontalPosition / 100) * CANVAS_SIZE - qr.size / 2
    const y = (qr.verticalPosition / 100) * CANVAS_SIZE - qr.size / 2
    ctx.drawImage(assets.qr, x, y, qr.size, qr.size)
  }

  // Last, so it sits on top of everything.
  if (assets.logo) {
    const { size, bottom, right, variant } = design.logo
    drawLogo(
      ctx,
      assets.logo,
      placeLogo(assets.logo, { size, bottom, right }),
      {
        variant,
        ink: monochromeInk(designIsLight(design)),
        ...assets.brand,
      },
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
