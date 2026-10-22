/**
 * What a speaker takes away from the Feedback Code tab (speaker feedback
 * spec §9.2): the QR as a slide PNG or an SVG, the print sheet's text and
 * the file names. Pure except for the two renderers, which run the `qrcode`
 * package in the browser and in Node alike.
 *
 * Every rendering is dark on light with a quiet zone, whatever the page's
 * theme: a QR drawn for dark mode does not scan from a white slide, and one
 * without a quiet zone does not scan at all when it sits on a busy one. The
 * one exception is asked for by name: a transparent PNG, for a speaker whose
 * slide is light already and who wants no white square on it.
 */

/** The question on the attendee page, repeated on the sheet and the screen. */
export const FEEDBACK_PROMPT = 'How was this session?'

/** Modules of white around the symbol: the standard's minimum. */
export const QR_QUIET_ZONE = 4

/** Wide enough to fill a 4K slide's height without scaling up. */
export const SLIDE_PNG_WIDTH = 2048

const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: QR_QUIET_ZONE,
  color: { dark: '#000000', light: '#ffffff' },
} as const

/** The URL as a room reads it: without the scheme. */
export function feedbackCodeDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '')
}

const MAX_SLUG = 40

/**
 * Letters NFKD cannot decompose, spelled in ASCII: the Norwegian three the
 * way Norwegians do, the rest the usual way.
 */
const ASCII_SPELLING: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'aa',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  œ: 'oe',
}
const UNDECOMPOSABLE = new RegExp(
  `[${Object.keys(ASCII_SPELLING).join('')}]`,
  'g',
)

/** `Sikkerhet på toppen` → `sikkerhet-paa-toppen`; a title with nothing ASCII in it gives ''. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(UNDECOMPOSABLE, (c) => ASCII_SPELLING[c])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-$/, '')
}

/**
 * `feedback-code-<code>-<title slug>[-transparent].<ext>`: both are on the
 * speaker's own page already, so the name leaks nothing, a speaker with
 * several talks can tell the files apart, and the two PNGs don't overwrite
 * each other.
 */
export function feedbackCodeFileName(
  url: string,
  title: string,
  ext: 'png' | 'svg',
  { transparent = false }: { transparent?: boolean } = {},
): string {
  const code = url.match(/\/f\/([^/?#]+)/)?.[1]?.toLowerCase()
  const slug = slugOf(title)
  return (
    ['feedback-code', code, slug, transparent && 'transparent']
      .filter(Boolean)
      .join('-') + `.${ext}`
  )
}

/** Keynote and PowerPoint import an SVG with no size at about 37 pt. */
const SVG_SIZE = 1024

/**
 * The symbol as a vector image: `viewBox` in modules, quiet zone included,
 * with a `width`/`height` so slide software imports it at a usable size.
 */
export async function renderFeedbackQrSvg(url: string): Promise<string> {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toString(url, { ...QR_OPTIONS, type: 'svg', width: SVG_SIZE })
}

/**
 * The symbol as a PNG data URL, `width` pixels square: a slide's by default.
 * `transparent` leaves the ground, quiet zone included, fully transparent
 * (alpha 0); the modules stay black, so it scans on a light slide only.
 */
export async function renderFeedbackQrPng(
  url: string,
  width = SLIDE_PNG_WIDTH,
  { transparent = false }: { transparent?: boolean } = {},
): Promise<string> {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toDataURL(url, {
    ...QR_OPTIONS,
    width,
    ...(transparent && {
      color: { ...QR_OPTIONS.color, light: '#ffffff00' },
    }),
  })
}
