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

/**
 * Share of `box` that differs from the background colour, with `source`
 * scaled to the 1080 canvas. Samples a REGION, not glyph pixels: Storybook's
 * fonts come from a CDN, so exact glyphs vary.
 */
function coverage(
  source: CanvasImageSource,
  size: number,
  box: Box,
  background: string,
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
  const [r, g, b] = [1, 3, 5].map((i) =>
    parseInt(background.slice(i, i + 2), 16),
  )
  let differing = 0
  for (let i = 0; i < data.length; i += 4) {
    const distance =
      Math.abs(data[i] - r) +
      Math.abs(data[i + 1] - g) +
      Math.abs(data[i + 2] - b)
    if (distance > 60) differing++
  }
  return differing / (data.length / 4)
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
    expect(coverage(canvas, CANVAS_SIZE, box, background)).toBeGreaterThan(0.05)
    if (below.height > 0) {
      expect(coverage(canvas, CANVAS_SIZE, below, background)).toBeLessThan(
        0.01,
      )
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
  },
}

export const UploadedLogoOnDark: Story = {
  args: { conferenceLogos: UPLOADED_LOGOS },
  play: async ({ canvasElement }) => {
    await pickBackground(within(canvasElement), 'Slate Gray')
    await expectLogoOnCanvas(canvasElement, '#334155')
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
    expect(coverage(image, image.width, logoBox(), '#10B981')).toBeGreaterThan(
      0.05,
    )
  },
}
