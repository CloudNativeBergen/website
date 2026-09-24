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
 * size has to be measured, and `getBBox()` measures geometry only: a line has
 * zero height, so without the stroke's extent it measures as nothing and the
 * generated wordmark is drawn instead.
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
 * A size-less logo is measured in the live document. sanitizeSvg's regex
 * misses a handler after `/` (`<image/onerror=…>`), which the HTML parser
 * still reads as an attribute — so the parsed tree has to be cleaned before
 * it is inserted, or the handler runs on the admin's page.
 */
export const HostileLogoRunsNothing: Story = {
  args: {
    conferenceLogos: {
      title: 'Konf',
      logoBright:
        '<svg><desc><meta http-equiv="refresh" content="0;url=#pwned"></desc><rect width="400" height="100" fill="#facc15"/><image href="x"/onerror="document.body.dataset.pwned=1"/></svg>',
    },
  },
  play: async ({ canvasElement }) => {
    // The logo was measured and drawn…
    await waitFor(() =>
      expect(inLogoBox(canvasElement, isYellow)).toBeGreaterThan(0.3),
    )
    // …and neither its handler nor its smuggled <meta> refresh ran (give a
    // failed image load and a 0 s refresh time to fire). The refresh targets
    // a same-document fragment so a regression shows without leaving the page.
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(document.body.dataset.pwned).toBeUndefined()
    expect(window.location.hash).not.toBe('#pwned')
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
