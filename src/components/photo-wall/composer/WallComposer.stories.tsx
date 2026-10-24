import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { WALL_FILTERS, type WallFilterKey } from '@/lib/photo-wall/filters'
import {
  endsWithEoi,
  listJpegSegments,
  stripJpegMetadata,
} from '@/lib/photo-wall/jpeg-strip'
import { MAX_PHOTO_BYTES } from '@/lib/photo-wall/encode'
import { DECODE_FAILED_MESSAGE, TOO_SMALL_MESSAGE } from './ComposerLanding'
import {
  GENERIC_FAILURE_MESSAGE,
  WallComposer,
  type WallComposerProps,
  type WallPostDraft,
} from './WallComposer'

/**
 * The composer at `/wall/post` (Photo Wall spec §6.5), with no server: Post
 * to the wall calls `onSubmit`. The photo is a drawn fjord scene served from
 * `.storybook/fixtures` (deterministic, no network beyond Storybook), picked
 * through the real file input so each story runs the real decode, resize and
 * filter path in the browser. Dark mode follows the global `theme` toolbar
 * (story-level `globals`).
 */
const meta = {
  title: 'Systems/PhotoWall/Composer',
  component: WallComposer,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'phone' },
  },
  args: {
    logo: { title: 'Cloud Native Days Norway' },
    deletesOn: '2026-11-26',
    onSubmit: fn<WallComposerProps['onSubmit']>(),
  },
} satisfies Meta<typeof WallComposer>

export default meta
type Story = StoryObj<typeof meta>

/** The fixture photo as the File a picker would hand over. */
async function fixturePhoto(): Promise<File> {
  const response = await fetch('/storybook-fixtures/wall-photo.jpg')
  return new File([await response.blob()], 'IMG_0042.jpg', {
    type: 'image/jpeg',
  })
}

/** Picks a file through Choose from your photos and waits for the composer. */
async function pickPhoto(canvasElement: HTMLElement, file: File) {
  const canvas = within(canvasElement)
  await userEvent.upload(canvas.getByLabelText('Choose from your photos'), file)
  // The composer takes focus on its heading once it has rendered; wait for
  // that so a story's own focus move is not undone by it.
  await waitFor(
    () =>
      expect(canvas.getByRole('heading', { name: 'Your photo' })).toHaveFocus(),
    { timeout: 10_000 },
  )
  return canvas
}

const pickFixture = async (canvasElement: HTMLElement) =>
  pickPhoto(canvasElement, await fixturePhoto())

/** Width and height from the JPEG's SOF segment, as the server reads them (§6.4). */
function sofSize(bytes: Uint8Array) {
  const sof = listJpegSegments(bytes).find(
    (s) =>
      s.marker >= 0xc0 &&
      s.marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(s.marker),
  )
  if (!sof) throw new Error('No SOF segment')
  const o = sof.offset
  return {
    height: (bytes[o + 5] << 8) | bytes[o + 6],
    width: (bytes[o + 7] << 8) | bytes[o + 8],
  }
}

export const Landing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Add your photo to the wall' }),
    ).toBeVisible()
    const camera = canvas.getByLabelText('Take a photo')
    await expect(camera).toHaveAttribute('capture', 'environment')
    await expect(camera).toHaveAttribute('accept', 'image/*')
    await expect(
      canvas.getByLabelText('Choose from your photos'),
    ).not.toHaveAttribute('capture')
    await expect(canvas.queryByRole('alert')).toBeNull()
  },
}

export const LandingDark: Story = {
  globals: { theme: 'dark' },
}

/** A file the browser cannot decode: the message, and the landing stays. */
export const DecodeFailed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const notAPhoto = new File(['not a photo'], 'IMG_0001.heic', {
      type: 'image/heic',
    })
    await userEvent.upload(
      canvas.getByLabelText('Choose from your photos'),
      notAPhoto,
    )
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(
        DECODE_FAILED_MESSAGE,
      ),
    )
    await expect(canvas.getByLabelText('Take a photo')).toBeVisible()
  },
}

/** Tab reaches the hidden file input; the ring shows on the button around it. */
export const LandingFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await expect(canvas.getByLabelText('Take a photo')).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByLabelText('Choose from your photos')).toHaveFocus()
    await userEvent.tab({ shift: true })
    await expect(canvas.getByLabelText('Take a photo')).toHaveFocus()
  },
}

export const LandingFocusDark: Story = {
  ...LandingFocus,
  globals: { theme: 'dark' },
}

/** A photo whose short edge would be under 320 px: refused before encoding. */
export const TooSmall: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const small = document.createElement('canvas')
    small.width = 300
    small.height = 200
    small.getContext('2d')!.fillRect(0, 0, 300, 200)
    const blob = await new Promise<Blob | null>((r) =>
      small.toBlob(r, 'image/jpeg', 0.8),
    )
    await userEvent.upload(
      canvas.getByLabelText('Choose from your photos'),
      new File([blob!], 'IMG_0002.jpg', { type: 'image/jpeg' }),
    )
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(TOO_SMALL_MESSAGE),
    )
    await expect(canvas.getByLabelText('Take a photo')).toBeVisible()
  },
}

/** The polaroid card as the editor, with the fixture photo just picked. */
export const Composer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    await expect(canvas.getByTestId('caption-counter')).toHaveTextContent(
      '0/80',
    )
    await expect(canvas.getByRole('radio', { name: 'Original' })).toBeChecked()
    await expect(canvas.getAllByRole('radio')).toHaveLength(9)
    await expect(
      canvas.getByRole('checkbox', {
        name: 'The organizers may also use my photo in their own marketing.',
      }),
    ).not.toBeChecked()
    await expect(canvas.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy#photo-wall',
    )
    await expect(canvas.getByText(/until/)).toHaveTextContent(
      'until 26 November 2026',
    )
    await expect(
      canvas.getByRole('button', { name: 'Post to the wall' }),
    ).toBeVisible()
  },
}

export const ComposerDark: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => {
    await pickFixture(canvasElement)
  },
}

/** Caption and name filled, Fjord picked: the card as it will show on the wall. */
export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Fjord' }))
    await userEvent.type(
      canvas.getByLabelText('Caption'),
      'kubectl apply -f joy{Enter}',
    )
    // Enter in the caption moves on to the name.
    await expect(canvas.getByLabelText('Your name (optional)')).toHaveFocus()
    await userEvent.keyboard('Ingrid')
    await expect(canvas.getByTestId('caption-counter')).toHaveTextContent(
      '20/80',
    )
  },
}

export const FilledDark: Story = {
  ...Filled,
  globals: { theme: 'dark' },
}

/** The caption stops at 80 code points: an emoji counts once, not twice. */
export const CaptionAtLimit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    const caption = canvas.getByLabelText('Caption')
    await userEvent.type(
      caption,
      'Best keynote so far, the eBPF demo was wild '.padEnd(77, '!'),
    )
    await userEvent.type(caption, '🎉🎉🎉🎉🎉')
    await expect(canvas.getByTestId('caption-counter')).toHaveTextContent(
      '80/80',
    )
    const value = (caption as HTMLTextAreaElement).value
    await expect(Array.from(value)).toHaveLength(80)
    await expect(value.endsWith('🎉🎉🎉')).toBe(true)
    // The name has its own limit, 40.
    const name = canvas.getByLabelText('Your name (optional)')
    await userEvent.type(name, 'x'.repeat(45))
    await expect((name as HTMLInputElement).value).toHaveLength(40)
  },
}

const withFilter = (key: WallFilterKey): Story => ({
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    const label = WALL_FILTERS.find((f) => f.key === key)!.label
    await userEvent.click(canvas.getByRole('radio', { name: label }))
    await expect(canvas.getByRole('radio', { name: label })).toBeChecked()
  },
})

export const FilterVivid = withFilter('vivid')
export const FilterWarm = withFilter('warm')
export const FilterFade = withFilter('fade')
export const FilterFjord = withFilter('fjord')
export const FilterAurora = withFilter('aurora')
export const FilterMono = withFilter('mono')
export const FilterNoir = withFilter('noir')
export const FilterRetro = withFilter('retro')

/** The photo window dragged to the top of a portrait photo. */
export const CroppedToTop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    const window = canvas.getByRole('button', { name: 'Photo position' })
    await expect(window).toHaveAttribute('aria-roledescription', 'crop')
    window.focus()
    for (let i = 0; i < 20; i++) await userEvent.keyboard('{ArrowUp}')
    await expect(canvas.getByTestId('crop-readout')).toHaveTextContent(
      'Showing 50% from the left, 0% from the top',
    )
    await expect(
      canvas.getByTestId('photo-preview').getAttribute('style'),
    ).toMatch(/object-position:\s*50% 0%/)
  },
}

/**
 * Post to the wall: `onSubmit` gets a JPEG Blob with the filter baked in,
 * no APP1, inside the server's rules (§6.4), and the normalised fields.
 */
export const Posts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await pickFixture(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Noir' }))
    await userEvent.type(
      canvas.getByLabelText('Caption'),
      '  kubectl   apply -f joy  ',
    )
    await userEvent.type(
      canvas.getByLabelText('Your name (optional)'),
      'Ingrid ',
    )
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Post to the wall' }),
    )
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1), {
      timeout: 10_000,
    })
    const draft = (
      args.onSubmit as ReturnType<typeof fn<WallComposerProps['onSubmit']>>
    ).mock.calls[0][0] as WallPostDraft
    await expect(draft.photo).toBeInstanceOf(Blob)
    await expect(draft.photo.type).toBe('image/jpeg')
    await expect(draft.photo.size).toBeGreaterThan(1000)
    await expect(draft.photo.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES)
    await expect(draft).toMatchObject({
      caption: 'kubectl apply -f joy',
      name: 'Ingrid',
      crop: { x: 0.5, y: 0.5 },
      marketingConsent: true,
    })
    const bytes = new Uint8Array(await draft.photo.arrayBuffer())
    await expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8])
    await expect(endsWithEoi(bytes)).toBe(true)
    const markers = listJpegSegments(bytes).map((s) => s.marker)
    await expect(markers.filter((m) => m >= 0xe1 && m <= 0xef)).toEqual([])
    await expect(markers).not.toContain(0xfe)
    await expect(sofSize(bytes)).toEqual({ width: 1200, height: 1600 })
  },
}

/** A 20 MP photo (over the iOS pixel cap) comes out with a 2048 px long edge. */
export const LargePhoto: Story = {
  play: async ({ canvasElement, args }) => {
    const big = document.createElement('canvas')
    big.width = 5200
    big.height = 3900
    const ctx = big.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, big.width, big.height)
    g.addColorStop(0, '#1d4ed8')
    g.addColorStop(1, '#f59e0b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, big.width, big.height)
    const blob = await new Promise<Blob | null>((r) =>
      big.toBlob(r, 'image/jpeg', 0.8),
    )
    const canvas = await pickPhoto(
      canvasElement,
      new File([blob!], 'IMG_0100.jpg', { type: 'image/jpeg' }),
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Post to the wall' }),
    )
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1), {
      timeout: 20_000,
    })
    const draft = (
      args.onSubmit as ReturnType<typeof fn<WallComposerProps['onSubmit']>>
    ).mock.calls[0][0] as WallPostDraft
    const bytes = new Uint8Array(await draft.photo.arrayBuffer())
    await expect(sofSize(bytes)).toEqual({ width: 2048, height: 1536 })
  },
}

/** `onSubmit` rejects: the generic message, and the photo and fields stay. */
export const SubmitFails: Story = {
  args: {
    onSubmit: fn<WallComposerProps['onSubmit']>(async () => {
      throw new Error('refused')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await pickFixture(canvasElement)
    await userEvent.type(canvas.getByLabelText('Caption'), 'Coffee #3')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Post to the wall' }),
    )
    await waitFor(
      () =>
        expect(canvas.getByRole('alert')).toHaveTextContent(
          GENERIC_FAILURE_MESSAGE,
        ),
      { timeout: 10_000 },
    )
    await expect(canvas.getByLabelText('Caption')).toHaveValue('Coffee #3')
    await expect(
      canvas.getByRole('button', { name: 'Post to the wall' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
  },
}

// ---------------------------------------------------------------------------
// The encoder probe: what THIS browser's canvas JPEG encoder writes, before
// and after the strip. Open it on an iPhone (Safari) to answer §6.5's open
// question about a Safari-written APP1 with the real encoder.
// ---------------------------------------------------------------------------

const markerName = (m: number) =>
  m >= 0xe0 && m <= 0xef
    ? `APP${m - 0xe0}`
    : m === 0xfe
      ? 'COM'
      : m === 0xdb
        ? 'DQT'
        : m === 0xc4
          ? 'DHT'
          : m === 0xdd
            ? 'DRI'
            : m >= 0xc0 && m <= 0xcf
              ? `SOF${m - 0xc0}`
              : `FF${m.toString(16).toUpperCase()}`

function EncoderProbeView() {
  const [report, setReport] = useState<{
    ua: string
    before: string[]
    after: string[]
    bytes: number
    strippedBytes: number
  } | null>(null)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(0, 0, 640, 480)
    ctx.fillStyle = '#fff'
    ctx.fillRect(160, 120, 320, 240)
    canvas.toBlob(
      async (blob) => {
        if (!blob) return
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const stripped = stripJpegMetadata(bytes)
        setReport({
          ua: navigator.userAgent,
          before: listJpegSegments(bytes).map((s) => markerName(s.marker)),
          after: listJpegSegments(stripped).map((s) => markerName(s.marker)),
          bytes: bytes.length,
          strippedBytes: stripped.length,
        })
      },
      'image/jpeg',
      0.85,
    )
  }, [])
  const hasApp1 = report?.before.includes('APP1')
  return (
    <div className="min-h-dvh bg-white p-6 font-mono text-sm text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <h1 className="font-display text-xl font-semibold">
        Canvas JPEG encoder probe
      </h1>
      <p className="mt-2 font-sans text-gray-600 dark:text-gray-400">
        What this browser&apos;s{' '}
        <code>canvas.toBlob(&apos;image/jpeg&apos;)</code> writes, and what the
        composer&apos;s strip leaves.
      </p>
      {report ? (
        <dl className="mt-4 space-y-3" data-testid="probe-report">
          <div>
            <dt className="font-semibold">Browser</dt>
            <dd className="break-words">{report.ua}</dd>
          </div>
          <div>
            <dt className="font-semibold">
              Encoder wrote ({report.bytes} bytes)
            </dt>
            <dd data-testid="probe-before">{report.before.join(' ')}</dd>
          </div>
          <div>
            <dt className="font-semibold">
              After the strip ({report.strippedBytes} bytes)
            </dt>
            <dd data-testid="probe-after">{report.after.join(' ')}</dd>
          </div>
          <div>
            <dt className="font-semibold">Verdict</dt>
            <dd data-testid="probe-verdict">
              {hasApp1
                ? 'This encoder writes an APP1: without the strip the server would refuse every post from here.'
                : 'This encoder writes no APP1.'}
              {report.after.some((m) => m !== 'APP0' && m.startsWith('APP')) ||
              report.after.includes('COM')
                ? ' STRIP FAILED: metadata segments remain.'
                : ' The stripped bytes pass the server’s no-metadata rule.'}
            </dd>
          </div>
        </dl>
      ) : (
        <p role="status" className="mt-4">
          Encoding…
        </p>
      )}
    </div>
  )
}

/**
 * Not a composer story: the encoder probe for the real-iPhone check (§15).
 * Open this story in iPhone Safari; the verdict line says whether its
 * encoder writes an APP1 and whether the strip removes it.
 */
export const EncoderProbe: Story = {
  name: 'Encoder probe (open on an iPhone)',
  render: () => <EncoderProbeView />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId('probe-report')).toBeVisible(),
    )
    await expect(canvas.getByTestId('probe-after')).not.toHaveTextContent(
      /APP[1-9]|COM/,
    )
    await expect(canvas.getByTestId('probe-verdict')).toHaveTextContent(
      'pass the server’s no-metadata rule',
    )
  },
}
