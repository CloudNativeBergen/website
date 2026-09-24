import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { MemeGenerator } from './MemeGenerator'
import { MemeGeneratorWithDownload } from './MemeGeneratorWithDownload'

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

/**
 * Share of the default logo box (360 px wide, 40 px in from the bottom-right
 * corner) that differs from the background colour. Samples the REGION, not
 * glyph pixels: Storybook's fonts come from a CDN, so exact glyphs vary.
 */
function logoBoxCoverage(root: HTMLElement, background: string) {
  const canvas = root.querySelector('canvas')!
  const data = canvas
    .getContext('2d')!
    .getImageData(680, 1040 - 87, 360, 87).data
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

/** The logo is ON the canvas: its box is not just background. */
async function expectLogoOnCanvas(root: HTMLElement, background: string) {
  await waitFor(() =>
    expect(logoBoxCoverage(root, background)).toBeGreaterThan(0.05),
  )
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

export const FallbackGradient: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await openBackgroundAdvanced(canvas)
    await userEvent.click(canvas.getByRole('button', { name: /Gradient/ }))
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
  },
}
