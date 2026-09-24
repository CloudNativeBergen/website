import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemeGenerator } from './MemeGenerator'
import { MemeGeneratorWithDownload } from './MemeGeneratorWithDownload'
import { captureImage } from '../common/image-capture'
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
    const isWhite: Pixel = (r, g, b) => r > 240 && g > 240 && b > 240
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
    const isRed: Pixel = (r, g, b) => r > 200 && g < 60 && b > 50 && b < 110
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
