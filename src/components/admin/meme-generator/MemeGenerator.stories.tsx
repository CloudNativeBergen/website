import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemeGenerator } from './MemeGenerator'
import { MemeGeneratorWithDownload } from './MemeGeneratorWithDownload'
import { captureImage } from '../../common/image-capture'
import {
  CANVAS_SIZE,
  LOGO_PADDING_DEFAULT,
  LOGO_SIZE_DEFAULT,
} from './meme-generator-config'
import {
  LOGO_BOX_ASPECT,
  logoFrame,
  type LogoPlacement,
} from './meme-generator-logo'
import type { EncoderBackend } from './meme-generator-export'
import type { BackgroundGallery } from './meme-generator-gallery'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'

const meta = {
  title: 'Systems/Marketing/Admin/MemeGenerator',
  component: MemeGenerator,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    conferenceLogos: { title: 'Cloud Native Days Norway 2026' },
  },
} satisfies Meta<typeof MemeGenerator>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expectLogoOnCanvas(canvasElement, '#10B981')
  },
}

/**
 * A stand-in for an uploaded horizontal logo, in the 970×234 box real logos
 * use. The two variants are deliberately different colours so a capture shows
 * WHICH one was drawn: navy ink for light backgrounds, white-and-yellow for
 * dark ones. The light variant — the one the default background shows —
 * has no `xmlns`: stored logos are not guaranteed one, and Firefox will not
 * rasterise an SVG image without it.
 */
const UPLOADED_LOGOS = {
  title: 'Cloud Native Days Norway 2026',
  logoBright:
    '<svg viewBox="0 0 970 234"><circle cx="117" cy="117" r="110" fill="#0f172a"/><rect x="270" y="40" width="680" height="64" rx="12" fill="#0f172a"/><rect x="270" y="134" width="480" height="60" rx="12" fill="#1d4ed8"/></svg>',
  logoDark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><circle cx="117" cy="117" r="110" fill="#ffffff"/><rect x="270" y="40" width="680" height="64" rx="12" fill="#ffffff"/><rect x="270" y="134" width="480" height="60" rx="12" fill="#facc15"/></svg>',
}

type Canvas = ReturnType<typeof within>

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The overlay's logo box for these slider values, in canvas pixels. */
function logoBox(
  placement: LogoPlacement = {
    size: LOGO_SIZE_DEFAULT,
    bottom: LOGO_PADDING_DEFAULT,
    right: LOGO_PADDING_DEFAULT,
  },
): Box {
  return logoFrame({ ...placement, aspect: 1 / LOGO_BOX_ASPECT, fit: 'width' })
}

type Pixel = (r: number, g: number, b: number) => boolean

/** Differs clearly from `hex` — the fixture colours are all far apart. */
const differsFrom =
  (hex: string): Pixel =>
  (r, g, b) => {
    const [br, bg, bb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) > 60
  }

/** The light-mode fixture's #1d4ed8 bar. */
const isBlue: Pixel = (r, g, b) => r < 70 && g > 50 && g < 110 && b > 190
/**
 * The dark-mode fixture's #facc15 bar (and other yellow fixtures). It also
 * matches the Sunbeam Yellow BACKGROUND — never assert it on that preset.
 */
const isYellow: Pixel = (r, g, b) => r > 200 && g > 170 && b < 80
/** Black ink — the monochrome wordmark on a light background. */
const isInk: Pixel = (r, g, b) => r < 40 && g < 40 && b < 40

/**
 * Share of `box` whose pixels match `pixel`, with `source` scaled to the 1080
 * canvas. Samples a REGION, not glyph pixels: Storybook's fonts come from a
 * CDN, so exact glyphs vary.
 */
function share(
  source: CanvasImageSource,
  size: number,
  box: Box,
  pixel: Pixel,
) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, size, size, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  const data = ctx.getImageData(
    Math.round(box.x),
    Math.round(box.y),
    Math.round(box.width),
    Math.round(box.height),
  ).data
  let matching = 0
  for (let i = 0; i < data.length; i += 4) {
    if (pixel(data[i], data[i + 1], data[i + 2])) matching++
  }
  return matching / (data.length / 4)
}

/** Share of the logo box on the preview canvas matching `pixel`. */
function inLogoBox(root: HTMLElement, pixel: Pixel, placement?: LogoPlacement) {
  return share(
    root.querySelector('canvas')!,
    CANVAS_SIZE,
    logoBox(placement),
    pixel,
  )
}

/**
 * The UPLOADED logo — this variant, not the other one and not the fallback
 * wordmark — is drawn: its signature colour is in the box, the other
 * variant's is not.
 */
async function expectVariant(
  root: HTMLElement,
  variant: 'light' | 'dark',
  placement?: LogoPlacement,
) {
  const [mine, theirs] =
    variant === 'light' ? [isBlue, isYellow] : [isYellow, isBlue]
  await waitFor(() => {
    expect(inLogoBox(root, mine, placement)).toBeGreaterThan(0.05)
    expect(inLogoBox(root, theirs, placement)).toBeLessThan(0.001)
  })
}

/**
 * The logo is ON the canvas, inside its box: the box is not just background,
 * and the strip below it is (a mark scaled past its box spills into it).
 */
async function expectLogoOnCanvas(
  root: HTMLElement,
  background: string,
  placement?: LogoPlacement,
) {
  const box = logoBox(placement)
  const below = {
    x: box.x,
    y: box.y + box.height + 2,
    width: box.width,
    height: Math.min(30, CANVAS_SIZE - (box.y + box.height + 2)),
  }
  await waitFor(() => {
    const canvas = root.querySelector('canvas')!
    expect(
      share(canvas, CANVAS_SIZE, box, differsFrom(background)),
    ).toBeGreaterThan(0.05)
    if (below.height > 0) {
      expect(
        share(canvas, CANVAS_SIZE, below, differsFrom(background)),
      ).toBeLessThan(0.01)
    }
  })
}

async function openBackgroundAdvanced(canvas: Canvas) {
  // [0] is the Background & Logo panel.
  await userEvent.click(
    canvas.getAllByRole('button', { name: 'Advanced Options' })[0],
  )
}

/** Pick a background preset by its visible name. */
async function pickBackground(canvas: Canvas, name: string) {
  await userEvent.click(canvas.getByTitle(name))
}

/**
 * Shaped like the stored Bergen logos: the mark has its own fills, but the
 * text is `currentColor` under `text-brand-slate-gray dark:text-white` — page
 * CSS an SVG drawn as an image never sees. Its bar spans x 270–950, y 40–194.
 */
const CLASS_COLOURED_LOGO = {
  title: 'Cloud Native Day Bergen 2025',
  logoBright:
    '<svg viewBox="0 0 970 234" xmlns="http://www.w3.org/2000/svg"><circle cx="117" cy="117" r="110" fill="#3B82F6"/><rect x="270" y="40" width="680" height="154" fill="currentColor" class="text-brand-slate-gray dark:text-white"/></svg>',
}

export const ClassColouredLogoGradientOnDark: Story = {
  args: { conferenceLogos: CLASS_COLOURED_LOGO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pickBackground(canvas, 'Slate Gray')
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))

    // The text bar, inset from its edges. On a dark design it must be light:
    // unresolved, `currentColor` is black and the name vanishes.
    const box = logoBox()
    const scale = box.width / 970
    await waitFor(() => {
      const { data } = canvasElement
        .querySelector('canvas')!
        .getContext('2d')!
        .getImageData(
          Math.round(box.x + 300 * scale),
          Math.round(box.y + 60 * scale),
          Math.round(600 * scale),
          Math.round(100 * scale),
        )
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3
      }
      expect(sum / (data.length / 4)).toBeGreaterThan(200)
    })
  },
}

/**
 * A logo with no viewBox and no size, drawing one thick horizontal line. Its
 * size has to be measured, and a line's GEOMETRY has zero height — only its
 * stroke paints. Measuring the painted pixels finds it; measuring geometry
 * would find nothing and draw the generated wordmark instead.
 */
export const SizelessStrokedLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><line x1="0" y1="50" x2="400" y2="50" stroke="#facc15" stroke-width="100"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.3),
    )
  },
}

/**
 * Legacy markup the inline renderer's HTML parser forgave and an image's XML
 * parser does not: an unbound `xlink:` prefix, an upper-case `VIEWBOX`, no
 * `xmlns`, and a size in points. Unrepaired it fails to decode and the
 * generated wordmark is drawn instead of the yellow bar.
 */
export const LegacyMarkupLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg VIEWBOX="0 0 970 234" width="727.5pt" height="175.5pt"><defs><rect id="bar" width="970" height="234" fill="#facc15"/></defs><use xlink:href="#bar"/></svg>',
    },
  },
  play: SizelessStrokedLogo.play,
}

/**
 * An upload that cannot be drawn (here: it paints nothing measurable) falls
 * back to the generated wordmark rather than leaving the logo out.
 */
export const UndrawableLogoFallsBack: Story = {
  args: {
    conferenceLogos: { title: 'Konf', logoBright: '<svg><g/></svg>' },
  },
  play: async ({ canvasElement }) => {
    // Default background, monochrome: the wordmark is black ink.
    await expectLogoOnCanvas(canvasElement, '#10B981')
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isInk)).toBeGreaterThan(0.03),
    )
  },
}

/**
 * An uploaded logo that is NOT 970:234 keeps the overlay's fit: the box's
 * width, its own aspect, hanging from the box's top edge — so a square fills
 * the box's full width and runs on below it. Contained, it would sit as a
 * small square in the middle of the box.
 */
export const SquareLogoFillsWidth: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const box = logoBox()
    const leftQuarter = { ...box, width: box.width / 4 }
    const below = { ...box, y: box.y + box.height + 2, height: 30 }
    // …and no wider than the box: the strip right of it stays background.
    const right = { ...box, x: box.x + box.width + 2, width: 30 }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(share(canvas(), CANVAS_SIZE, right, isYellow)).toBeLessThan(0.01)
      expect(
        share(canvas(), CANVAS_SIZE, leftQuarter, isYellow),
      ).toBeGreaterThan(0.95)
      expect(share(canvas(), CANVAS_SIZE, below, isYellow)).toBeGreaterThan(
        0.95,
      )
    })
  },
}

/**
 * A hostile size-less logo. It has to be measured, and it is only ever drawn
 * as an image — so none of its script, navigation or off-origin loads may
 * reach the admin's page, however they are spelled. Every load points at a
 * same-origin `/__logo-leak-*` path, so a request would show in Resource
 * Timing; the refresh targets `#pwned`, observable without leaving the page;
 * `href="#x"` is a local reference that still fires `error`.
 */
const HOSTILE_LOGO = [
  '<svg>',
  '<desc><meta http-equiv="refresh" content="0;url=#pwned"></desc>',
  // @import only counts first in its sheet, so it gets a sheet of its own.
  '<style>@\\69mport "/__logo-leak-2.css";</style>',
  '<style>body{background-image:u\\72l(/__logo-leak-1.png)}',
  'body{cursor:image-set("/__logo-leak-3.png" 1x),auto}</style>',
  '<rect width="400" height="100" fill="#facc15"/>',
  '<rect width="1" height="1" fill="url(/__logo-leak-4.svg#a)"/>',
  '<image href="#x"/onerror="document.body.dataset.pwned=1"/>',
  '</svg>',
].join('')

export const HostileLogoRunsNothing: Story = {
  args: { conferenceLogos: { title: 'Konf', logoBright: HOSTILE_LOGO } },
  play: async ({ canvasElement }) => {
    // The logo was measured and drawn…
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.3),
    )
    // …and nothing it asks for happened (give a failed load, a 0 s refresh
    // and style-driven fetches time to fire).
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(document.body.dataset.pwned).toBeUndefined()
    expect(window.location.hash).not.toBe('#pwned')
    expect(
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('__logo-leak')),
    ).toEqual([])
  },
}

/** Gradient fills in `currentColor` for a logo that sets it to `inherit`. */
export const InheritRootColourGradientOnDark: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234" style="color: inherit"><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pickBackground(canvas, 'Slate Gray')
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isWhite)).toBeGreaterThan(0.9),
    )
  },
}

/**
 * A logo's own stylesheet keeps working under the gradient tint: quoted local
 * `url("#g")` references and structural selectors (`:first-child`) both.
 */
export const StylesheetFeaturesSurviveTint: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><rect width="485" height="234"/><rect x="485" width="485" height="234" class="b"/><defs><linearGradient id="g"><stop stop-color="#facc15"/></linearGradient></defs><style>rect:first-child{fill:#1d4ed8}.b{fill:url("#g")}</style></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
    const box = logoBox()
    const left = { ...box, width: box.width / 2 - 4 }
    const right = {
      ...box,
      x: box.x + box.width / 2 + 4,
      width: box.width / 2 - 4,
    }
    const canvasEl = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(share(canvasEl(), CANVAS_SIZE, left, isBlue)).toBeGreaterThan(0.9)
      expect(share(canvasEl(), CANVAS_SIZE, right, isYellow)).toBeGreaterThan(
        0.9,
      )
    })
  },
}

/**
 * In gradient the logo's OWN colour wins, even one set in its own stylesheet:
 * the overlay left a logo's markup alone outside monochrome. The resolved
 * fallback colour must not override it.
 */
export const StylesheetColouredLogoKeepsItsColour: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><style>svg{color:#e11d48}</style><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isRed)).toBeGreaterThan(0.9),
    )
  },
}

/**
 * A size-less logo drawn far from the origin: measuring must find it wherever
 * it is, not just in the first area it searches.
 */
export const FarFlungSizelessLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><rect x="9000" y="-7000" width="4000" height="1000" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    // Tight to the painted edge, which only the fine pass achieves: the
    // coarse one leaves a margin of blank user space round the logo.
    const box = logoBox()
    // Pixels 1–4 in from the box edge: past the anti-aliased first pixel and
    // the fine pass's sub-pixel slack, well inside the coarse pass's margin.
    const leftEdge = { ...box, x: box.x + 1, width: 3 }
    const topEdge = { ...box, y: box.y + 1, height: 3 }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(share(canvas(), CANVAS_SIZE, leftEdge, isYellow)).toBeGreaterThan(
        0.9,
      )
      expect(share(canvas(), CANVAS_SIZE, topEdge, isYellow)).toBeGreaterThan(
        0.9,
      )
    })
  },
}

/**
 * A size-less logo sized in %: a full-bleed background and a centred mark.
 * The % must resolve against one fixed viewport — resolved against the ever
 * wider search, the background grew and swallowed the mark.
 */
export const PercentSizedSizelessLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><rect width="100%" height="100%" fill="#1d4ed8"/><circle cx="50%" cy="50%" r="40" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(inLogoBox(canvasElement, isBlue)).toBeGreaterThan(0.4)
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.05)
    })
  },
}

/** A root `color` ATTRIBUTE is the logo's own colour too, and survives Gradient. */
export const AttributeColouredLogoKeepsItsColour: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234" color="#e11d48"><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: StylesheetColouredLogoKeepsItsColour.play,
}

/**
 * The fallback tint survives a broken stylesheet of the logo's (an unclosed
 * comment would swallow a rule appended INTO it).
 */
export const MalformedStylesheetStillTinted: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><rect width="970" height="234" fill="currentColor"/><style>/* unclosed</style></svg>',
    },
  },
  play: InheritRootColourGradientOnDark.play,
}

/**
 * A logo that smuggles a `foreignObject` image in through SMIL, which an
 * engine that taints canvases for it would turn into a failed export. This
 * pins that Download still works with it. It cannot exercise the read-back
 * fallback: no current engine taints here (Chromium in CI; Firefox 157 and
 * Safari 27 checked by hand).
 */
export const TaintingLogoStillExports: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><rect width="970" height="234" fill="#facc15"/><image width="10" height="10"><set attributeName="href" to="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27%3E%3CforeignObject width=%2710%27 height=%2710%27%3E%3Cdiv xmlns=%27http://www.w3.org/1999/xhtml%27%3Ex%3C/div%3E%3C/foreignObject%3E%3C/svg%3E"/></image></svg>',
    },
  },
  render: (args) => (
    <MemeGeneratorWithDownload
      conferenceTitle={args.conferenceLogos?.title}
      conferenceLogos={args.conferenceLogos}
    />
  ),
  play: async ({ canvasElement }) => {
    await expectLogoOnCanvas(canvasElement, '#10B981')
    const preview = canvasElement.querySelector('canvas')!.parentElement!
    const blob = await captureImage(preview.parentElement!)
    expect(blob.size).toBeGreaterThan(0)
  },
}

/**
 * % is a viewport length wherever it appears — here in a `<defs>` shape drawn
 * through `<use>`, and in a `clipPath` — and must resolve against one fixed
 * viewport however measuring moves the view. The white backdrop is 300×150;
 * the clip keeps the left half (150×150) of a red band over it.
 */
export const PercentInDefsAndClipPath: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><defs><rect id="bg" width="100%" height="100%" fill="#1d4ed8"/><clipPath id="c"><rect width="50%" height="100%"/></clipPath></defs><use href="#bg"/><rect width="300" height="150" fill="#facc15" clip-path="url(#c)"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    // 300×150 drawn at the box width is 360×180: the box (87 tall) shows the
    // top half — yellow on the left half, blue on the right.
    const box = logoBox()
    const left = { ...box, x: box.x + 8, width: box.width / 2 - 16 }
    const right = {
      ...box,
      x: box.x + box.width / 2 + 8,
      width: box.width / 2 - 16,
    }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(share(canvas(), CANVAS_SIZE, left, isYellow)).toBeGreaterThan(0.95)
      expect(share(canvas(), CANVAS_SIZE, right, isBlue)).toBeGreaterThan(0.95)
    })
  },
}

/**
 * Between 1024 and ~1100 px the editor's two columns are narrower than the
 * 540 px preview. The preview must shrink as a square: squeezed, the canvas
 * (and now the logo drawn on it) would be distorted.
 */
export const NarrowColumnPreviewStaysSquare: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  decorators: [
    (Story) => (
      <div style={{ width: 960 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const { width, height } = canvasElement
      .querySelector('canvas')!
      .getBoundingClientRect()
    expect(width).toBeLessThan(540)
    expect(Math.abs(width - height)).toBeLessThanOrEqual(1)
  },
}

/**
 * A logo sized only by inline CSS. An SVG image ignores CSS for its size in
 * every engine (measured: Chromium 150×150, Firefox 300×300, Safari 150×150 —
 * all the viewBox ratio), so it draws SQUARE: filling the box width and
 * hanging below it. Honouring the CSS (4:1) would letterbox it instead.
 */
export const InlineCssSizedLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:400px;height:100px"><rect width="100" height="100" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const box = logoBox()
    const leftQuarter = { ...box, width: box.width * 0.2 }
    const wellBelow = { ...box, y: box.y + box.height + 8, height: 20 }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(
        share(canvas(), CANVAS_SIZE, leftQuarter, isYellow),
      ).toBeGreaterThan(0.9)
      expect(share(canvas(), CANVAS_SIZE, wellBelow, isYellow)).toBeGreaterThan(
        0.9,
      )
    })
  },
}

/**
 * Download clicked while the logo is still rasterising. Decoding is slowed
 * to 1.5 s here (real complex logos take up to ~2 s); capture must wait for
 * the logo instead of exporting the canvas without it after its fixed pause.
 */
export const DownloadWaitsForSlowLogo: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  beforeEach: () => {
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return new Promise<void>((resolve) => setTimeout(resolve, 1500)).then(
        () => decode.call(this),
      )
    }
    return () => {
      HTMLImageElement.prototype.decode = decode
    }
  },
  render: (args) => (
    <MemeGeneratorWithDownload
      conferenceTitle={args.conferenceLogos?.title}
      conferenceLogos={args.conferenceLogos}
    />
  ),
  play: async ({ canvasElement }) => {
    // At once, before the raster lands — as an eager click would.
    const preview = canvasElement.querySelector('canvas')!.parentElement!
    const blob = await captureImage(preview.parentElement!)
    const image = await createImageBitmap(blob)
    expect(share(image, image.width, logoBox(), isBlue)).toBeGreaterThan(0.05)
  },
}

/**
 * Download clicked while the WORDMARK's webfont is still loading (slowed to
 * 1.5 s here): the canvas shows the fallback font until it lands, so the
 * capture must wait for it rather than export the fallback.
 */
export const DownloadWaitsForWordmarkFont: Story = {
  beforeEach: () => {
    const fonts = document.fonts
    const load = fonts.load.bind(fonts)
    fonts.load = (font: string, text?: string) =>
      new Promise<FontFace[]>((resolve) =>
        setTimeout(() => resolve(load(font, text)), 1500),
      )
    return () => {
      fonts.load = load
    }
  },
  render: (args) => (
    <MemeGeneratorWithDownload
      conferenceTitle={args.conferenceLogos?.title}
      conferenceLogos={args.conferenceLogos}
    />
  ),
  play: async ({ canvasElement }) => {
    const started = performance.now()
    const preview = canvasElement.querySelector('canvas')!.parentElement!
    await captureImage(preview.parentElement!)
    // Without the wait, capture finishes after its fixed ~300 ms pause.
    expect(performance.now() - started).toBeGreaterThan(1200)
  },
}

/** Click Gradient in the Background & Logo panel. */
async function chooseGradient(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await openBackgroundAdvanced(canvas)
  await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
}

const isWhite: Pixel = (r, g, b) => r > 240 && g > 240 && b > 240
const isRed: Pixel = (r, g, b) => r > 200 && g < 60 && b > 50 && b < 110

/**
 * A logo colouring its root from a PAGE custom property: inline it resolved
 * against the tenant theme. The image has no such property, so the page's
 * value must be carried in (here --brand-primary is set to #1d4ed8).
 */
export const PageVariableColouredLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234" style="color:var(--brand-primary)"><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  beforeEach: () => {
    const root = document.documentElement
    root.style.setProperty('--brand-primary', '#1d4ed8')
    return () => root.style.removeProperty('--brand-primary')
  },
  play: async ({ canvasElement }) => {
    await chooseGradient(canvasElement)
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isBlue)).toBeGreaterThan(0.9),
    )
  },
}

/**
 * The same, but the page defines no such property: the root colour cannot
 * resolve, so the fallback tint applies — white on a dark design, not black.
 */
export const UnresolvedVariableColourOnDark: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234" style="color:var(--not-on-this-page)"><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: InheritRootColourGradientOnDark.play,
}

/**
 * `+400pt × +100pt` is a valid length: the image is 4:1, its square viewBox
 * letterboxed in the middle. Rejected, the logo is fitted as a square.
 */
export const PlusSignedLengthsLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="+400pt" height="+100pt"><rect width="100" height="100" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const box = logoBox()
    const middle = {
      ...box,
      x: box.x + box.width * 0.42,
      width: box.width * 0.16,
    }
    const leftQuarter = { ...box, width: box.width * 0.2 }
    // Fitted as a square, the frame would hang far below the box.
    const wellBelow = { ...box, y: box.y + box.height + 8, height: 20 }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(share(canvas(), CANVAS_SIZE, middle, isYellow)).toBeGreaterThan(
        0.9,
      )
      expect(share(canvas(), CANVAS_SIZE, leftQuarter, isYellow)).toBeLessThan(
        0.01,
      )
      expect(share(canvas(), CANVAS_SIZE, wellBelow, isYellow)).toBeLessThan(
        0.01,
      )
    })
  },
}

/**
 * Only a width: a browser gives this image 600×150 — the one dimension it
 * has, and the default for the other — so its `100%` backdrop is 4:1.
 * Replacing both with 300×150 would make it 2:1 and hang below the box.
 */
export const LoneWidthSizelessLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg width="600"><rect width="100%" height="100%" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    const box = logoBox()
    const wellBelow = { ...box, y: box.y + box.height + 8, height: 20 }
    const canvas = () => canvasElement.querySelector('canvas')!
    await waitFor(() => {
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.9)
      expect(share(canvas(), CANVAS_SIZE, wellBelow, isYellow)).toBeLessThan(
        0.01,
      )
    })
  },
}

/**
 * A logo that clips itself (`overflow="hidden"`): what lies outside its
 * 300×150 viewport stays hidden, as it was inline. Here that is a yellow
 * block at x = 400; only the blue block inside is drawn.
 */
export const OverflowHiddenSizelessLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg overflow="hidden"><rect width="200" height="50" fill="#1d4ed8"/><rect x="400" width="200" height="50" fill="#facc15"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(inLogoBox(canvasElement, isBlue)).toBeGreaterThan(0.5)
      expect(inLogoBox(canvasElement, isYellow)).toBeLessThan(0.01)
    })
  },
}

/** A root colour from a custom property the ROOT itself defines inline. */
export const RootDefinedVariableColourKept: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234" style="--brand:#e11d48;color:var(--brand)"><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await chooseGradient(canvasElement)
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isRed)).toBeGreaterThan(0.9),
    )
  },
}

/** A colour set in the logo's OWN cascade layer still beats the fallback. */
export const LayeredLogoColourKept: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 234"><style>@layer brand{:root{color:#e11d48}}</style><rect width="970" height="234" fill="currentColor"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await chooseGradient(canvasElement)
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isRed)).toBeGreaterThan(0.9),
    )
  },
}

/**
 * A size-less logo revealed through a `currentColor` mask: visible only once
 * tinted (white on this dark design). Measured untinted — black mask — it
 * paints nothing and falls back to the wordmark.
 */
export const CurrentColorMaskedSizelessLogo: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><defs><mask id="m"><rect width="400" height="100" fill="currentColor"/></mask></defs><rect width="400" height="100" fill="#facc15" mask="url(#m)"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    await pickBackground(within(canvasElement), 'Slate Gray')
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.3),
    )
  },
}

export const FallbackGradient: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
    await expectLogoOnCanvas(canvasElement, '#10B981')
  },
}

/**
 * A short name makes a TALL wordmark. The overlay contained it in the box;
 * filling the box's width instead makes it ~2.6× too big and runs it off the
 * canvas — which the long default title happens to hide.
 */
export const ShortTitleWordmark: Story = {
  args: { conferenceLogos: { title: 'Konf' } },
  play: async ({ canvasElement }) => {
    await expectLogoOnCanvas(canvasElement, '#10B981')
  },
}

export const FallbackMonochromeOnDark: Story = {
  play: async ({ canvasElement }) => {
    await pickBackground(within(canvasElement), 'Slate Gray')
    await expectLogoOnCanvas(canvasElement, '#334155')
  },
}

export const UploadedLogoOnLight: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  play: async ({ canvasElement }) => {
    await pickBackground(within(canvasElement), 'Sky Mist')
    await expectLogoOnCanvas(canvasElement, '#E0F2FE')
    await expectVariant(canvasElement, 'light')
  },
}

export const UploadedLogoOnDark: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  play: async ({ canvasElement }) => {
    await pickBackground(within(canvasElement), 'Slate Gray')
    await expectLogoOnCanvas(canvasElement, '#334155')
    await expectVariant(canvasElement, 'dark')
  },
}

/** The admin's theme must not choose the logo variant — the background does. */
export const UploadedLogoOnLightAdminDark: Story = {
  ...UploadedLogoOnLight,
  globals: { theme: 'dark' },
}

export const LogoResized: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pickBackground(canvas, 'Slate Gray')
    await openBackgroundAdvanced(canvas)
    const set = (label: RegExp, value: number) => {
      const input = canvas.getByLabelText(label) as HTMLInputElement
      // Range inputs ignore typing; set the value the way React listens for.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(/Logo Size/, 500)
    set(/Logo Distance from Bottom/, 400)
    set(/Logo Distance from Right/, 200)
    await expectLogoOnCanvas(canvasElement, '#334155', {
      size: 500,
      bottom: 400,
      right: 200,
    })
    await expectVariant(canvasElement, 'dark', {
      size: 500,
      bottom: 400,
      right: 200,
    })
  },
}

/**
 * Canvas text is not DOM text, so a browser never fetches a webfont on its own
 * account of it — the component has to ask for the face and redraw once it
 * lands. This story types a headline and switches it to a family no other part
 * of the app renders, which is exactly the case that would otherwise paint in
 * the fallback sans.
 */
export const WebfontHeadline: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // [0] is the Background & Logo panel; [1] belongs to Text Line 1.
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Advanced Options' })[1],
    )

    const text = 'Ship it'
    await userEvent.type(
      canvas.getAllByPlaceholderText('Enter your text...')[0],
      text,
    )
    await userEvent.selectOptions(
      canvas.getByLabelText('Font Family'),
      'IBM Plex Sans',
    )

    // The face reaching `loaded` is the assertion that matters. Nothing else on
    // this story renders IBM Plex Sans in the DOM, so it stays `unloaded` — and
    // the canvas silently paints in the fallback — unless the component asked
    // for it. `document.fonts.check()` would NOT catch that: it answers true
    // for any family with no `@font-face` at all.
    await waitFor(() => {
      const loaded = [...document.fonts].some(
        (face) => face.family === 'IBM Plex Sans' && face.status === 'loaded',
      )
      expect(loaded).toBe(true)
    })
  },
}

/**
 * The studio's wiring: the preview inside `DownloadableImage`. The PNG it
 * downloads (and attaches to a Task) is rasterised from this DOM, so it must
 * carry the canvas logo exactly once.
 */
export const WithDownload: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  render: (args) => (
    <MemeGeneratorWithDownload
      conferenceTitle={args.conferenceLogos?.title}
      conferenceLogos={args.conferenceLogos}
    />
  ),
  play: async ({ canvasElement }) => {
    await expectLogoOnCanvas(canvasElement, '#10B981')

    // Once: the canvas is the only thing drawing the logo — no DOM overlay.
    const preview = canvasElement.querySelector('canvas')!.parentElement!
    expect([...preview.children].map((child) => child.tagName)).toEqual([
      'CANVAS',
    ])

    // The PNG that Download and "Attach to Task" produce carries it.
    const blob = await captureImage(preview.parentElement!)
    const image = await createImageBitmap(blob)
    // …and it is the uploaded logo's light variant, not the fallback.
    expect(share(image, image.width, logoBox(), isBlue)).toBeGreaterThan(0.05)
  },
}

/**
 * Three text lines and a QR code on the default background: the composition
 * the before/after comparison of #1173 was taken on.
 */
export const HeadlineAndQr: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Text Line 3 starts collapsed.
    await userEvent.click(canvas.getByRole('button', { name: 'Text Line 3' }))
    const [first, second, third] =
      canvas.getAllByPlaceholderText('Enter your text...')
    await userEvent.type(first, 'Cloud Native')
    await userEvent.type(second, 'CFP is open')
    await userEvent.type(third, 'Submit by 1 May')
    await userEvent.type(
      canvas.getByPlaceholderText('https://example.com'),
      'https://cndn.no',
    )
  },
}

const isMagenta: Pixel = (r, g, b) => r > 230 && g < 30 && b > 230

/**
 * An uploaded background shows at once. It used to race its own decode: the
 * draw ran on the upload's state change, before the image had loaded, and
 * nothing redrew once it had — so it appeared only on the next edit.
 */
export const BackgroundImageAppearsOnUpload: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openBackgroundAdvanced(canvas)

    const source = document.createElement('canvas')
    source.width = source.height = 64
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>((resolve) =>
      source.toBlob((b) => resolve(b!), 'image/png'),
    )
    await userEvent.upload(
      canvas.getByLabelText(/Upload Background Image/),
      new File([blob], 'magenta.png', { type: 'image/png' }),
    )

    // No further interaction: the upload alone must bring the image in.
    const corner = { x: 0, y: 0, width: 100, height: 100 }
    await waitFor(() =>
      expect(
        share(
          canvasElement.querySelector('canvas')!,
          CANVAS_SIZE,
          corner,
          isMagenta,
        ),
      ).toBeGreaterThan(0.99),
    )
    await expect(canvas.getByText('Current: magenta.png')).toBeVisible()
  },
}

/**
 * The text line's horizontal position moves it: left-aligned at 40 %, the
 * headline starts well inside the canvas instead of at the padding.
 */
export const LeftTextFollowsHorizontalPosition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Advanced Options' })[1],
    )
    await userEvent.type(
      canvas.getAllByPlaceholderText('Enter your text...')[0],
      'Hi',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Left' }))
    const slider = canvas.getByLabelText(
      /Distance from Left/,
    ) as HTMLInputElement
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(slider, '40')
    slider.dispatchEvent(new Event('input', { bubbles: true }))

    const isWhite: Pixel = (r, g, b) => r > 240 && g > 240 && b > 240
    const preview = () => canvasElement.querySelector('canvas')!
    // The headline's band (30 % down, 120 px type): empty left of 40 %, inked right of it.
    const band = { y: 264, height: 120 }
    await waitFor(() => {
      expect(
        share(preview(), CANVAS_SIZE, { x: 0, width: 420, ...band }, isWhite),
      ).toBe(0)
      expect(
        share(preview(), CANVAS_SIZE, { x: 432, width: 200, ...band }, isWhite),
      ).toBeGreaterThan(0.05)
    })
  },
}

// ── Video mode (#1174) ────────────────────────────────────────────────────

const CLOUD_BLUE = '#1D4ED8'
const FRESH_GREEN = '#10B981'

/** Within a few levels of `hex` on every channel. */
const near =
  (hex: string, tolerance = 12): Pixel =>
  (r, g, b) => {
    const [er, eg, eb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return (
      Math.abs(r - er) <= tolerance &&
      Math.abs(g - eg) <= tolerance &&
      Math.abs(b - eb) <= tolerance
    )
  }

/** Half of each colour, the way a fade at its midpoint composites them. */
const midway = (a: string, b: string) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        (parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** A corner no text line, QR code or logo reaches: background only. */
const BACKGROUND_CORNER: Box = { x: 24, y: 24, width: 120, height: 120 }

/** The timeline's own announcements — the export panel has another. */
const timelineStatus = (canvas: Canvas) =>
  within(canvas.getByRole('region', { name: 'Video timeline' })).getByRole(
    'status',
  )

async function seekTo(canvas: Canvas, seconds: number) {
  const field = canvas.getByLabelText('Playhead (s)')
  await userEvent.clear(field)
  await userEvent.type(field, `${seconds}{Enter}`)
}

/**
 * Two scenes — Cloud Blue, then the default Fresh Green — faded into each
 * other, with the playhead pinned on the boundary: the middle of the fade.
 * Each scene is drawn to its own layer and the pair composited, so the
 * background there is half of each; either scene alone fails this. Before and
 * after the half-second window only one scene shows.
 */
export const VideoFadeMidway: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }),
    )
    await userEvent.selectOptions(canvas.getByLabelText('Into scene 2'), 'fade')

    const corner = (pixel: Pixel) =>
      share(
        canvasElement.querySelector('canvas')!,
        CANVAS_SIZE,
        BACKGROUND_CORNER,
        pixel,
      )

    await seekTo(canvas, 2.7)
    await waitFor(() => expect(corner(near(CLOUD_BLUE))).toBeGreaterThan(0.95))
    await seekTo(canvas, 3.4)
    await waitFor(() => expect(corner(near(FRESH_GREEN))).toBeGreaterThan(0.95))

    await seekTo(canvas, 3)
    await waitFor(() =>
      expect(corner(near(midway(CLOUD_BLUE, FRESH_GREEN)))).toBeGreaterThan(
        0.95,
      ),
    )
    expect(corner(near(CLOUD_BLUE, 40))).toBe(0)
    expect(corner(near(FRESH_GREEN, 40))).toBe(0)
  },
}

/**
 * Playback paints: from a blue scene 1, playing on into the default green
 * scene 2 changes the canvas without any scrubbing — the frames come from the
 * same `drawFrame` as a scrub, driven by the clock.
 */
export const VideoPlaybackPaints: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await seekTo(canvas, 2.5)

    const corner = (pixel: Pixel) =>
      share(
        canvasElement.querySelector('canvas')!,
        CANVAS_SIZE,
        BACKGROUND_CORNER,
        pixel,
      )
    await waitFor(() => expect(corner(near(CLOUD_BLUE))).toBeGreaterThan(0.95))

    await userEvent.click(canvas.getByRole('button', { name: 'Play' }))
    await waitFor(
      () => expect(corner(near(FRESH_GREEN))).toBeGreaterThan(0.95),
      { timeout: 3000 },
    )
  },
}

/**
 * Keyboard only, with real key presses: switch to Video, add a scene, lengthen
 * it, move the playhead, play and pause.
 */
export const VideoByKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const activate = async (element: HTMLElement) => {
      element.focus()
      await userEvent.keyboard('{Enter}')
    }
    const valueOf = (name: string) =>
      Number(canvas.getByRole('slider', { name }).getAttribute('aria-valuenow'))

    await activate(canvas.getByRole('button', { name: 'Video' }))
    await activate(canvas.getByRole('button', { name: 'Add scene' }))
    expect(valueOf('Scene 2 length')).toBe(3)

    canvas.getByRole('slider', { name: 'Scene 2 length' }).focus()
    await userEvent.keyboard(
      '{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}',
    )
    expect(valueOf('Scene 2 length')).toBe(4.2)

    canvas.getByRole('slider', { name: 'Playhead' }).focus()
    await userEvent.keyboard('{End}')
    expect(valueOf('Playhead')).toBe(7.2)
    await userEvent.keyboard('{Home}{Shift>}{ArrowRight}{/Shift}')
    expect(valueOf('Playhead')).toBe(1)

    await activate(canvas.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(valueOf('Playhead')).toBeGreaterThan(1.2))
    // Focus stays on the same button, now labelled Pause.
    await userEvent.keyboard('{Enter}')
    await canvas.findByRole('button', { name: 'Play' })
    const paused = valueOf('Playhead')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(valueOf('Playhead')).toBe(paused)
  },
}

/**
 * At phone width the timeline scrolls sideways inside its panel rather than
 * widening the page. `defaultViewport` is load-bearing: the test runner reads
 * it (see .storybook/test-runner.ts), and its default is 1280.
 */
export const VideoTimelineOnPhone: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    for (let i = 0; i < 3; i++) {
      await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    }
    const timeline = canvas.getByRole('region', { name: 'Video timeline' })
    const track = canvas.getByRole('list', { name: 'Scenes' }).parentElement!
      .parentElement!
    expect(track.scrollWidth).toBeGreaterThan(track.clientWidth)
    expect(timeline.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth,
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}

/**
 * Picking a scene puts the playhead exactly on the boundary before it — the
 * same place as the previous scene's length handle. The handle must be what
 * a press there hits, or resizing needs the playhead moved away first.
 */
export const VideoEdgeAbovePlayhead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Scene 2, 3.0 s' }),
    )

    const edge = canvas.getByRole('slider', { name: 'Scene 1 length' })
    const { left, top, width, height } = edge.getBoundingClientRect()
    const hit = document.elementFromPoint(left + width / 2, top + height / 2)
    expect(hit?.closest('[role="slider"]')).toBe(edge)
  },
}

/** The mean RGBA of the background corner, read straight off the preview. */
function cornerRgba(root: HTMLElement): [number, number, number, number] {
  const { x, y, width, height } = BACKGROUND_CORNER
  const data = root
    .querySelector('canvas')!
    .getContext('2d')!
    .getImageData(x, y, width, height).data
  const sum = [0, 0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 4; c++) sum[c] += data[i + c]
  }
  const n = data.length / 4
  return sum.map((v) => v / n) as [number, number, number, number]
}

/** Blue scene 1 fading into green scene 2, playhead at `at`. */
async function blueFadingIntoGreen(canvasElement: HTMLElement, at: number) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }))
  await userEvent.selectOptions(canvas.getByLabelText('Into scene 2'), 'fade')
  await seekTo(canvas, at)
  return canvas
}

/**
 * The frame playback paints at a time inside a fade is the frame a scrub to
 * that time paints. Pixels and playhead are read together WHILE playing —
 * they change in the same commit — and never after Pause, which repaints.
 * Then a scrub to the recorded time must paint the same pixels.
 */
export const VideoPlaybackMatchesScrub: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await blueFadingIntoGreen(canvasElement, 2.8)
    const playhead = () =>
      Number(
        canvas
          .getByRole('slider', { name: 'Playhead' })
          .getAttribute('aria-valuenow'),
      )
    await userEvent.click(canvas.getByRole('button', { name: 'Play' }))
    let t = 0
    let played: number[] = []
    await waitFor(() => {
      t = playhead()
      played = cornerRgba(canvasElement)
      expect(t).toBeGreaterThan(2.9)
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }))

    // Read inside the window, or this proves nothing.
    expect(t).toBeLessThan(3.2)
    expect(played[2]).toBeLessThan(210) // not Cloud Blue alone…
    expect(played[2]).toBeGreaterThan(135) // …nor Fresh Green alone

    await seekTo(canvas, 0)
    await seekTo(canvas, t)
    await waitFor(() => {
      const scrubbed = cornerRgba(canvasElement)
      for (let c = 0; c < 4; c++) {
        expect(Math.abs(scrubbed[c] - played[c])).toBeLessThanOrEqual(2)
      }
    })
  },
}

/**
 * A cross-fade into a scene whose background is a TRANSPARENT image: midway,
 * the corner is the outgoing blue at half strength and the incoming nothing
 * at half — half-transparent. Painting the incoming layer over an opaque
 * outgoing one would leave it fully opaque blue until the window closed.
 */
export const VideoFadeIntoTransparent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))

    const clear = document.createElement('canvas')
    clear.width = clear.height = 64
    const blob = await new Promise<Blob>((resolve) =>
      clear.toBlob((b) => resolve(b!), 'image/png'),
    )
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    await userEvent.upload(
      canvas.getByLabelText(/Upload Background Image/),
      new File([blob], 'clear.png', { type: 'image/png' }),
    )
    await canvas.findByText('Current: clear.png')

    await userEvent.click(
      canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }),
    )
    await userEvent.selectOptions(canvas.getByLabelText('Into scene 2'), 'fade')

    await seekTo(canvas, 3.4)
    await waitFor(() => expect(cornerRgba(canvasElement)[3]).toBeLessThan(2))
    await seekTo(canvas, 3)
    await waitFor(() => {
      const alpha = cornerRgba(canvasElement)[3]
      expect(alpha).toBeGreaterThan(115)
      expect(alpha).toBeLessThan(140)
    })
  },
}

/** Blue scene 1 into green scene 2 by `transition`, playhead at `at`. */
async function blueIntoGreen(
  canvasElement: HTMLElement,
  transition: 'slide' | 'zoom',
  at: number,
) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }))
  await userEvent.selectOptions(
    canvas.getByLabelText('Into scene 2'),
    transition,
  )
  await seekTo(canvas, at)
  return canvas
}

/**
 * A slide at its midpoint: the incoming green scene has pushed the blue one
 * half out to the left, so the left edge is blue and the right edge green —
 * a fade would make both edges the same mix. The same half-second window as
 * a fade: a quarter-second either side of the boundary shows one scene.
 */
export const VideoSlideMidway: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await blueIntoGreen(canvasElement, 'slide', 3)
    const preview = () => canvasElement.querySelector('canvas')!
    const right: Box = { ...BACKGROUND_CORNER, x: CANVAS_SIZE - 144 }
    await waitFor(() => {
      expect(
        share(preview(), CANVAS_SIZE, BACKGROUND_CORNER, near(CLOUD_BLUE)),
      ).toBeGreaterThan(0.95)
      expect(
        share(preview(), CANVAS_SIZE, right, near(FRESH_GREEN)),
      ).toBeGreaterThan(0.95)
    })
    await seekTo(canvas, 2.7)
    await waitFor(() =>
      expect(share(preview(), CANVAS_SIZE, right, near(CLOUD_BLUE))).toBe(1),
    )
    await seekTo(canvas, 3.3)
    await waitFor(() =>
      expect(
        share(preview(), CANVAS_SIZE, BACKGROUND_CORNER, near(FRESH_GREEN)),
      ).toBe(1),
    )
  },
}

/**
 * A zoom at its midpoint shows no edge: the very corner is half of each
 * colour, where a layer drawn smaller than the canvas would leave it dark.
 * Solid scenes look the same scaled or not, so the scaling itself is pinned
 * by the frame unit test, not here.
 */
export const VideoZoomShowsNoEdge: Story = {
  play: async ({ canvasElement }) => {
    await blueIntoGreen(canvasElement, 'zoom', 3)
    await waitFor(() =>
      expect(
        share(
          canvasElement.querySelector('canvas')!,
          CANVAS_SIZE,
          { x: 0, y: 0, width: 40, height: 40 },
          near(midway(CLOUD_BLUE, FRESH_GREEN)),
        ),
      ).toBeGreaterThan(0.95),
    )
  },
}

/**
 * Scene management by keyboard alone, in a real browser with user-event's
 * keyboard (synthetic events, not OS key presses): Alt+→ moves a scene and
 * focus stays on it through React's commit, a copy is refused past the
 * minute with the reason, Delete takes a scene out, and Ctrl+Z / Ctrl+Shift+Z
 * walk the history.
 */
export const VideoScenesByKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const activate = async (element: HTMLElement) => {
      element.focus()
      await userEvent.keyboard('{Enter}')
    }
    const labels = () =>
      within(canvas.getByRole('list', { name: 'Scenes' }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))

    await activate(canvas.getByRole('button', { name: 'Video' }))
    await activate(canvas.getByRole('button', { name: 'Add scene' }))
    const length = canvas.getByRole('slider', { name: 'Scene 2 length' })
    length.focus()
    await userEvent.keyboard('{End}')
    expect(length.getAttribute('aria-valuenow')).toBe('57')

    canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }).focus()
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(labels()).toEqual(['Scene 1, 57.0 s', 'Scene 2, 3.0 s'])
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Scene 2, 3.0 s',
    )
    // The playhead went with the scene it was on — the 57 s one, now first.
    expect(
      canvas
        .getByRole('slider', { name: 'Playhead' })
        .getAttribute('aria-valuenow'),
    ).toBe('0')
    await userEvent.keyboard('{Enter}') // picks the moved scene
    expect(
      canvas
        .getByRole('slider', { name: 'Playhead' })
        .getAttribute('aria-valuenow'),
    ).toBe('57')

    await activate(canvas.getByRole('button', { name: 'Duplicate scene 2' }))
    expect(timelineStatus(canvas).textContent).toBe(
      'A copy of scene 2 is 3.0 s and only 0.0 s of the 60 s is left. Shorten a scene first.',
    )

    await activate(canvas.getByRole('button', { name: 'Delete scene 2' }))
    expect(labels()).toEqual(['Scene 1, 57.0 s'])

    document.body.focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(labels()).toHaveLength(2)
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(labels()).toEqual(['Scene 1, 3.0 s', 'Scene 2, 57.0 s'])
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(labels()).toEqual(['Scene 1, 57.0 s', 'Scene 2, 3.0 s'])
  },
}

/**
 * Four scenes that fill most of the minute, one sliding into the next, and an
 * add refused with the reason — for the eye: the scene actions, the refusal
 * and the transition marks. Light and dark.
 */
async function nearTheCap(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
  const lengthField = (n: number) =>
    canvas.getByLabelText(`Scene ${n} length (s)`)
  for (const [n, seconds] of [
    [1, 20],
    [2, 15],
    [3, 12],
    [4, 11],
  ] as const) {
    if (n > 1)
      await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await userEvent.clear(lengthField(n))
    await userEvent.type(lengthField(n), `${seconds}{Enter}`)
  }
  await userEvent.click(canvas.getByRole('button', { name: 'Scene 2, 15.0 s' }))
  await userEvent.selectOptions(canvas.getByLabelText('Into scene 3'), 'slide')
  await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
  await expect(timelineStatus(canvas)).toHaveTextContent(
    'only 2.0 s of the 60 s is left',
  )
  // Back to the start, so a capture shows the first scenes and their marks;
  // the reason stays, as the scenes have not changed.
  canvas.getByRole('slider', { name: 'Playhead' }).focus()
  await userEvent.keyboard('{Home}')
  await expect(timelineStatus(canvas)).toHaveTextContent('Shorten a scene')
}

export const VideoAtTheCap: Story = {
  play: async ({ canvasElement }) => nearTheCap(canvasElement),
}

export const VideoAtTheCapDark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => nearTheCap(canvasElement),
}

// ── Element entrances and exits, and drift (#1176) ─────────────────────────

/** Where the default first line's headline sits: centred, 30 % down. */
const HEADLINE_BOX: Box = { x: 340, y: 270, width: 400, height: 110 }

async function typeHeadline(canvas: Canvas, text: string) {
  await userEvent.type(
    canvas.getAllByPlaceholderText('Enter your text...')[0],
    text,
  )
}

async function setSeconds(canvas: Canvas, label: string, value: number) {
  const field = canvas.getByLabelText(label)
  await userEvent.clear(field)
  await userEvent.type(field, `${value}{Enter}`)
}

/**
 * A line that leaves at 1 s is gone after it: with the playhead at 2 s its
 * box is the background colour, every pixel of it. At 0.5 s the same box
 * holds the line's white text — so the box is the right place to look.
 */
export const VideoLineAfterItsExit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await typeHeadline(canvas, 'GONE')
    await userEvent.selectOptions(canvas.getByLabelText('Text 1 exit'), 'fade')
    await setSeconds(canvas, 'Text 1 leaves (s)', 1)
    await expect(
      canvas.getByRole('slider', { name: 'Scene 1 Text 1 leaves' }),
    ).toHaveAttribute('aria-valuenow', '1')

    const box = (pixel: Pixel) =>
      share(
        canvasElement.querySelector('canvas')!,
        CANVAS_SIZE,
        HEADLINE_BOX,
        pixel,
      )
    await seekTo(canvas, 0.5)
    await waitFor(() => expect(box(isWhite)).toBeGreaterThan(0.05))
    await seekTo(canvas, 2)
    await waitFor(() => expect(box(near(FRESH_GREEN, 2))).toBe(1))
    // With no exit preset it goes at once — the same, from the moment it
    // leaves.
    await userEvent.selectOptions(canvas.getByLabelText('Text 1 exit'), 'none')
    await seekTo(canvas, 0.9)
    await waitFor(() => expect(box(isWhite)).toBeGreaterThan(0.05))
    await seekTo(canvas, 1)
    await waitFor(() => expect(box(near(FRESH_GREEN, 2))).toBe(1))
  },
}

/**
 * Every element animated, over two scenes, paused a second in: the fixture
 * for looking at the bars and the fields, in light and dark.
 */
export const VideoElementTimings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await typeHeadline(canvas, 'Call for papers')
    await userEvent.type(
      canvas.getAllByPlaceholderText('Enter your text...')[1],
      'Closes Friday',
    )
    await userEvent.type(
      canvas.getByPlaceholderText('https://example.com'),
      'https://example.com',
    )
    await userEvent.selectOptions(
      canvas.getByLabelText('Text 1 entrance'),
      'pop',
    )
    await userEvent.selectOptions(
      canvas.getByLabelText('Text 2 entrance'),
      'slide-up',
    )
    await setSeconds(canvas, 'Text 2 enters (s)', 0.8)
    await userEvent.selectOptions(
      canvas.getByLabelText('QR code entrance'),
      'fade',
    )
    await setSeconds(canvas, 'QR code enters (s)', 1.5)
    await userEvent.selectOptions(canvas.getByLabelText('QR code exit'), 'fade')
    await userEvent.selectOptions(canvas.getByLabelText('Logo exit'), 'pop')
    await setSeconds(canvas, 'Logo leaves (s)', 2.5)
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await typeHeadline(canvas, 'See you there')
    await seekTo(canvas, 1)
    await expect(
      canvas.getByRole('slider', { name: 'Scene 1 QR code enters' }),
    ).toHaveAttribute('aria-valuenow', '1.5')
  },
}

export const VideoElementTimingsDark: Story = {
  ...VideoElementTimings,
  globals: { theme: 'dark' },
}

/**
 * On a phone the animation table scrolls inside its panel — its selects keep
 * a readable width — and never widens the page.
 */
export const VideoElementTimingsOnPhone: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async (context) => {
    await VideoElementTimings.play!(context)
    const canvas = within(context.canvasElement)
    const table = canvas.getByRole('table')
    const scroller = table.parentElement!
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    expect(
      canvas.getByLabelText('Text 1 entrance').getBoundingClientRect().width,
    ).toBeGreaterThanOrEqual(100)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    )
  },
}

/** A photo with a blue band down its left edge and magenta elsewhere. */
async function bandedPhoto(side: number): Promise<File> {
  const source = document.createElement('canvas')
  source.width = source.height = side
  const ctx = source.getContext('2d')!
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, side, side)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(0, 0, side * 0.05, side)
  const blob = await new Promise<Blob>((resolve) =>
    source.toBlob((b) => resolve(b!), 'image/png'),
  )
  return new File([blob], 'large.png', { type: 'image/png' })
}

const isPureBlue: Pixel = (r, g, b) => r < 30 && g < 30 && b > 225

/**
 * Drift on a 25-megapixel photo: the zoom is visible — the band down the
 * left edge, on screen at the start, has zoomed off it by the end. That each
 * frame draws ONE pre-scaled ~1200 px copy, not the photo, is pinned in
 * MemeGenerator.motion.test; a frame-rate check here would measure the CI
 * machine (Chromium on an M1 holds 60 fps with or without the copy).
 */
export const VideoDriftLargePhoto: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await openBackgroundAdvanced(canvas)
    await userEvent.upload(
      canvas.getByLabelText(/Upload Background Image/),
      await bandedPhoto(5000),
    )
    await canvas.findByText('Current: large.png')
    await userEvent.click(canvas.getByLabelText(/Drift/))

    const edge = (pixel: Pixel) =>
      share(
        canvasElement.querySelector('canvas')!,
        CANVAS_SIZE,
        { x: 8, y: 400, width: 30, height: 200 },
        pixel,
      )
    await seekTo(canvas, 0)
    await waitFor(() => expect(edge(isPureBlue)).toBeGreaterThan(0.95))
    await seekTo(canvas, 2.9)
    await waitFor(() => expect(edge(isMagenta)).toBeGreaterThan(0.95))
  },
}

/**
 * Where two scenes meet, the logo's bars meet too: scene 1's leave end and
 * scene 2's enter end sit on the same boundary. Each must be what a press
 * on it hits — they used to be centred on the boundary, one on top of the
 * other, and the later one took every press.
 */
export const VideoBarEndsAtBoundary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    const leaves = canvas.getByRole('slider', { name: 'Scene 1 Logo leaves' })
    const enters = canvas.getByRole('slider', { name: 'Scene 2 Logo enters' })
    const a = leaves.getBoundingClientRect()
    const b = enters.getBoundingClientRect()
    expect(a.right).toBeLessThanOrEqual(b.left)
    const hit = (rect: DOMRect) =>
      document
        .elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        ?.closest('[role="slider"]')
    expect(hit(a)).toBe(leaves)
    expect(hit(b)).toBe(enters)

    // A 0.2 s bar is 12 px: its ends leave its middle to drag it whole by.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }),
    )
    await setSeconds(canvas, 'Logo leaves (s)', 0.2)
    await expect(leaves).toHaveAttribute('aria-valuenow', '0.2')
    // The playhead, which sits over a scene's start once it is picked, away.
    await seekTo(canvas, 2)
    const short = canvas.getByRole('slider', {
      name: 'Scene 1 Logo leaves',
    }).parentElement!
    const bar = short.getBoundingClientRect()
    const middle = document.elementFromPoint(
      bar.left + bar.width / 2,
      bar.top + bar.height / 2,
    )
    expect(middle?.closest('[role="slider"]')).toBeNull()
    expect(middle?.closest('[title^="Drag to move"]')).not.toBeNull()
  },
}

/**
 * A drag of a scene's length that shortens it and comes back gives the bars
 * back: every move resizes from the scene as the drag found it, so the logo's
 * 3.5–4.5 s bar, clamped to 3.5–4 on the way in, is 3.5–4.5 again at the end.
 */
export const VideoDurationDragGivesBarsBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await setSeconds(canvas, 'Scene 1 length (s)', 5)
    await setSeconds(canvas, 'Logo enters (s)', 3.5)
    await setSeconds(canvas, 'Logo leaves (s)', 4.5)
    const edge = canvas.getByRole('slider', { name: 'Scene 1 length' })
    const leaves = () =>
      canvas
        .getByRole('slider', { name: 'Scene 1 Logo leaves' })
        .getAttribute('aria-valuenow')
    const { left, width, top, height } = edge.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    // Pointer events on the handle itself, as the browser delivers them to
    // an element holding pointer capture (userEvent's synthetic moves go to
    // whatever is under the pointer instead). 60 px is a second.
    const pointer = (type: string, clientX: number) =>
      edge.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          pointerId: 1,
          clientX,
          clientY: y,
        }),
      )
    pointer('pointerdown', x)
    pointer('pointermove', x - 60)
    await waitFor(() => expect(leaves()).toBe('4'))
    pointer('pointermove', x)
    pointer('pointerup', x)
    await waitFor(() => expect(leaves()).toBe('4.5'))
    await expect(edge).toHaveAttribute('aria-valuenow', '5')
  },
}

// ── Export to MP4 (#1177) ─────────────────────────────────────────────────

/**
 * Press Export once it will act: on a cold load the fonts can hold it for
 * up to three seconds, and a press before then is (rightly) ignored.
 */
async function pressExport(panel: HTMLElement) {
  const button = within(panel).getByRole('button', { name: 'Export MP4' })
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'), {
    timeout: 5000,
  })
  await userEvent.click(button)
}

/**
 * The real encoder, whichever way it answers: headless Chromium commonly
 * has no H.264 encoder, a desktop Chrome does. Where it says no, the refusal
 * is shown and nothing is made. Where it says yes, a blue scene whose
 * headline slides up, faded into a green one, exports, and the file is read
 * back: an H.264 MP4 of the video's length, 1080 wide, over the bitrate floor.
 */
export const VideoExportRealEncoder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Cloud Blue' }))
    await typeHeadline(canvas, 'Export me')
    await userEvent.selectOptions(
      canvas.getByLabelText('Text 1 entrance'),
      'slide-up',
    )
    await setSeconds(canvas, 'Text 1 enters (s)', 0.5)
    await userEvent.click(canvas.getByRole('button', { name: 'Add scene' }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Scene 1, 3.0 s' }),
    )
    await userEvent.selectOptions(canvas.getByLabelText('Into scene 2'), 'fade')

    const panel = canvas.getByRole('region', { name: 'Export' })
    const status = within(panel).getByRole('status')
    const { mediabunnyBackend } = await import('./meme-generator-mediabunny')
    const supported = await mediabunnyBackend.supports()
    console.info('[export] H.264 supported:', supported)
    if (!supported) {
      await waitFor(() =>
        expect(status).toHaveTextContent('This browser cannot make MP4 video'),
      )
      await userEvent.click(
        within(panel).getByRole('button', { name: 'Export MP4' }),
      )
      expect(within(panel).queryByRole('link')).toBeNull()
      return
    }
    await pressExport(panel)
    const link = await within(panel).findByRole(
      'link',
      { name: /Download video/ },
      { timeout: 30_000 },
    )
    const blob = await (await fetch(link.getAttribute('href')!)).blob()
    const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny')
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    })
    expect(await input.getMimeType()).toContain('video/mp4')
    expect(await input.computeDuration()).toBeCloseTo(6, 1)
    const track = await input.getPrimaryVideoTrack()
    expect(track?.codec).toBe('avc')
    expect(track?.displayWidth).toBe(1080)
    expect((blob.size * 8) / 6).toBeGreaterThanOrEqual(192_000)
  },
}

/** An encoder that answers as told, for the states the real one rarely shows. */
function scriptedEncoder(script: {
  supported: boolean
  failAt?: number
}): EncoderBackend {
  return {
    supports: async () => script.supported,
    probe: async () => true,
    open: async () => ({
      add: (timestamp) =>
        Math.round(timestamp * 30) === script.failAt
          ? Promise.reject(
              new Error('EncodingError: The given encoding is not supported.'),
            )
          : new Promise((resolve) => setTimeout(resolve, 5)),
      finish: async () => new Blob([new Uint8Array(1_000_000)]),
      cancel: async () => {},
    }),
  }
}

/** Where the encoder says no, the button says why and makes nothing. */
export const VideoExportUnsupported: Story = {
  args: { encoder: scriptedEncoder({ supported: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    const panel = canvas.getByRole('region', { name: 'Export' })
    await waitFor(() =>
      expect(within(panel).getByRole('status')).toHaveTextContent(
        'This browser cannot make MP4 video. Use Chrome, Edge or Safari on a computer.',
      ),
    )
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Export MP4' }),
    )
    expect(within(panel).queryByRole('progressbar')).toBeNull()
    expect(within(panel).queryByRole('link')).toBeNull()
  },
}

/** An encoder that said yes, then failed a second in: its error is shown. */
export const VideoExportFailsMidway: Story = {
  args: { encoder: scriptedEncoder({ supported: true, failAt: 30 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    const panel = canvas.getByRole('region', { name: 'Export' })
    await pressExport(panel)
    await waitFor(() =>
      expect(within(panel).getByRole('status')).toHaveTextContent(
        'The export failed. The encoder failed: Error: EncodingError: The given encoding is not supported.',
      ),
    )
    expect(within(panel).queryByRole('link')).toBeNull()
  },
}

export const VideoExportFailsMidwayDark: Story = {
  ...VideoExportFailsMidway,
  globals: { theme: 'dark' },
}

// ── Gallery backgrounds (#1180) ───────────────────────────────────────────

/**
 * What the studio's gallery answers, the way the real one does: the picked
 * image comes back as a SAME-ORIGIN proxy URL (the story's MSW handler plays
 * `/api/proxy-image`), never the CDN's own.
 */
const GALLERY_PROXY_URL = `/api/proxy-image?url=${encodeURIComponent(
  'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg?h=1188&fit=max&fm=webp&q=90',
)}`

const storyGallery: BackgroundGallery = {
  images: async () => [
    {
      _id: 'asset-hall',
      title: 'Keynote hall',
      alt: 'The main hall, lit magenta',
      thumbnailUrl: GALLERY_PROXY_URL,
    },
    {
      _id: 'asset-crowd',
      title: 'A crowd between talks, in the foyer by the coffee',
      alt: 'People talking in the foyer',
      thumbnailUrl: null,
    },
  ],
  resolve: async (id) => ({
    _id: id,
    title: 'Keynote hall',
    url: GALLERY_PROXY_URL,
  }),
  keep: async () => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return { _id: 'asset-kept' }
  },
}

/** A 3:2 magenta photo, as the proxy would relay it. */
const proxyImage = http.get('/api/proxy-image', async () => {
  const source = document.createElement('canvas')
  source.width = 1782
  source.height = 1188
  const ctx = source.getContext('2d')!
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, source.width, source.height)
  const blob = await new Promise<Blob>((resolve) =>
    source.toBlob((b) => resolve(b!), 'image/png'),
  )
  return new HttpResponse(blob, { headers: { 'content-type': 'image/png' } })
})

/** What a frame read out of `canvas` looks like, or the error reading threw. */
function readCanvas(canvas: HTMLCanvasElement) {
  try {
    const [r, g, b] = canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data
    return { ok: true as const, magenta: isMagenta(r, g, b) }
  } catch (error) {
    return { ok: false as const, error: String(error) }
  }
}

/**
 * An encoder that READS every frame it is handed, as a real one does: a
 * tainted canvas throws there (a `VideoFrame` of one is a SecurityError).
 */
function readingEncoder(
  frames: ReturnType<typeof readCanvas>[],
): EncoderBackend {
  return {
    supports: async () => true,
    probe: async () => true,
    open: async (canvas) => ({
      add: async () => {
        frames.push(readCanvas(canvas))
      },
      finish: async () => new Blob([new Uint8Array(1_000_000)]),
      cancel: async () => {},
    }),
  }
}

/**
 * The picker is a `ModalShell`, portalled out of the global decorator's
 * `dark` wrapper; it themes itself from next-themes' `theme`, as in the app.
 * `defaultTheme` (not `forcedTheme`, which leaves `theme` alone) sets that,
 * under a storage key nothing writes; and the attribute is one nothing
 * styles, so no class lands on `<html>` to leak into later stories.
 */
const withNextTheme: Decorator = (Story, ctx) => {
  const theme = ctx.globals.theme === 'dark' ? 'dark' : 'light'
  return (
    <ThemeProvider
      key={theme}
      attribute="data-story-theme"
      defaultTheme={theme}
      storageKey={`meme-generator-story-theme-${theme}`}
      enableSystem={false}
    >
      <Story />
    </ThemeProvider>
  )
}

async function pickFromGallery(canvas: Canvas) {
  await userEvent.click(
    canvas.getByRole('button', { name: 'Choose from gallery' }),
  )
  // The picker is a dialog, portalled outside the story's root.
  const dialog = await within(document.body).findByRole('dialog')
  await userEvent.click(
    await within(dialog).findByRole('button', { name: /Keynote hall/ }),
  )
}

const exportedFrames: ReturnType<typeof readCanvas>[] = []

/**
 * A gallery image drawn as the background, previewed and EXPORTED: the
 * canvas is read back — by the preview check and by every exported frame —
 * without throwing, for an image at a same-origin URL such as the proxy's.
 * MSW stands in for the proxy here; the real route is not exercised. The
 * control below shows the same read DOES throw for a cross-origin image.
 */
export const BackgroundFromGallery: Story = {
  args: { gallery: storyGallery, encoder: readingEncoder(exportedFrames) },
  decorators: [withNextTheme],
  parameters: { msw: { handlers: [proxyImage] } },
  play: async ({ canvasElement }) => {
    exportedFrames.length = 0
    const canvas = within(canvasElement)
    await pickFromGallery(canvas)
    await expect(await canvas.findByText('Current: Keynote hall')).toBeVisible()
    await expect(canvas.getByText('In the gallery.')).toBeVisible()
    const preview = canvasElement.querySelector('canvas')!
    await waitFor(() =>
      expect(
        share(
          preview,
          CANVAS_SIZE,
          { x: 0, y: 0, width: 100, height: 100 },
          isMagenta,
        ),
      ).toBeGreaterThan(0.99),
    )
    // Reading the preview does not throw: it is not tainted.
    expect(readCanvas(preview)).toEqual({ ok: true, magenta: true })
    expect(() => preview.toDataURL()).not.toThrow()

    await userEvent.click(canvas.getByRole('button', { name: 'Video' }))
    const panel = canvas.getByRole('region', { name: 'Export' })
    await pressExport(panel)
    await within(panel).findByRole(
      'link',
      { name: /Download video/ },
      {
        timeout: 30_000,
      },
    )
    expect(exportedFrames.length).toBeGreaterThan(0)
    expect(exportedFrames.every((frame) => frame.ok && frame.magenta)).toBe(
      true,
    )
  },
}

export const BackgroundFromGalleryDark: Story = {
  ...BackgroundFromGallery,
  globals: { theme: 'dark' },
}

/**
 * The negative control: the same pick, with the gallery answering a raw
 * CROSS-ORIGIN URL — what drawing the CDN's own URL amounts to. The image
 * loads and draws, and reading the canvas then throws. This is what the
 * proxy exists to prevent, and it shows the read above can fail.
 */
export const CrossOriginBackgroundTaints: Story = {
  args: {
    gallery: {
      ...storyGallery,
      resolve: async (id) => {
        // The same Storybook, under its other name: a different origin that
        // sends no CORS header, so the image loads opaque.
        const other =
          location.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
        return {
          _id: id,
          title: 'Keynote hall',
          url: `${location.protocol}//${other}:${location.port}/images/default-avatar.png`,
        }
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await pickFromGallery(canvas)
    await canvas.findByText('Current: Keynote hall')
    const preview = canvasElement.querySelector('canvas')!
    await waitFor(() =>
      expect(readCanvas(preview)).toEqual({
        ok: false,
        error: expect.stringContaining('tainted'),
      }),
    )
  },
}

/** The picker, open, for the screenshot. */
export const GalleryPickerOpen: Story = {
  args: { gallery: storyGallery },
  decorators: [withNextTheme],
  parameters: { msw: { handlers: [proxyImage] } },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Choose from gallery',
      }),
    )
    const dialog = await within(document.body).findByRole('dialog')
    const option = await within(dialog).findByRole('button', {
      name: /Keynote hall/,
    })
    // The dialog fades in.
    await waitFor(() => expect(option).toBeVisible())
  },
}

export const GalleryPickerOpenDark: Story = {
  ...GalleryPickerOpen,
  globals: { theme: 'dark' },
}

async function openPicker(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Choose from gallery' }),
  )
  return within(await within(document.body).findByRole('dialog'))
}

/** The gallery could not be listed: said so, and nothing to pick. */
export const GalleryPickerFailed: Story = {
  args: {
    gallery: {
      ...storyGallery,
      images: async () => {
        throw new Error('network')
      },
    },
  },
  decorators: [withNextTheme],
  play: async ({ canvasElement }) => {
    const dialog = await openPicker(canvasElement)
    const alert = await dialog.findByRole('alert')
    await waitFor(() => expect(alert).toBeVisible())
    await expect(alert).toHaveTextContent(
      'The gallery could not be loaded. Close this and try again.',
    )
    await expect(dialog.queryAllByRole('listitem')).toHaveLength(0)
  },
}

export const GalleryPickerFailedDark: Story = {
  ...GalleryPickerFailed,
  globals: { theme: 'dark' },
}

/** An empty gallery says where images come from. */
export const GalleryPickerEmpty: Story = {
  args: { gallery: { ...storyGallery, images: async () => [] } },
  decorators: [withNextTheme],
  play: async ({ canvasElement }) => {
    const dialog = await openPicker(canvasElement)
    const empty = await dialog.findByText(
      /There are no images in the gallery yet/,
    )
    await waitFor(() => expect(empty).toBeVisible())
    await expect(dialog.queryAllByRole('listitem')).toHaveLength(0)
  },
}

/**
 * An uploaded background, kept: a title (from the filename) and the alt text
 * the gallery requires, then it says it is in the gallery.
 */
export const KeepUploadInGallery: Story = {
  args: { gallery: storyGallery },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const source = document.createElement('canvas')
    source.width = source.height = 64
    source.getContext('2d')!.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>((resolve) =>
      source.toBlob((b) => resolve(b!), 'image/png'),
    )
    await userEvent.upload(
      canvas.getByLabelText(/Upload Background Image/),
      new File([blob], 'stage-photo.png', { type: 'image/png' }),
    )
    await canvas.findByText('Current: stage-photo.png')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep in gallery' }),
    )
    await expect(canvas.getByLabelText('Title')).toHaveValue('stage-photo')
    // Focus goes into the form, back to Keep on Cancel, and to the result.
    await expect(document.activeElement).toBe(canvas.getByLabelText('Title'))
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(document.activeElement).toBe(
      canvas.getByRole('button', { name: 'Keep in gallery' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep in gallery' }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Save to gallery' }),
    ).toBeDisabled()
    // The keyboard path: alt text typed, then Enter in the title field.
    await userEvent.type(canvas.getByLabelText('Alt text'), 'An empty stage')
    await userEvent.type(canvas.getByLabelText('Title'), '{Enter}')
    const status = canvas.getByTestId('background-gallery-status')
    await waitFor(() => expect(status).toHaveTextContent('In the gallery.'))
    await waitFor(() => expect(document.activeElement).toBe(status))
  },
}

/** The keep form, open and filled, for the screenshot. */
export const KeepFormOpen: Story = {
  args: { gallery: storyGallery },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const source = document.createElement('canvas')
    source.width = source.height = 64
    source.getContext('2d')!.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>((resolve) =>
      source.toBlob((b) => resolve(b!), 'image/png'),
    )
    await userEvent.upload(
      canvas.getByLabelText(/Upload Background Image/),
      new File([blob], 'stage-photo.png', { type: 'image/png' }),
    )
    await canvas.findByText('Current: stage-photo.png')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Keep in gallery' }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Save to gallery' }),
    ).toBeDisabled()
  },
}

export const KeepFormOpenDark: Story = {
  ...KeepFormOpen,
  globals: { theme: 'dark' },
}
