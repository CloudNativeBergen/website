import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import {
  useGallerySave,
  type StudioCard,
  type VideoOrigin,
} from '@/components/common/image-capture'
import { withPortalTheme } from '@/lib/storybook'
import { StudioTaskProvider } from '../StudioTaskProvider'
import { StudioGalleryProvider } from './StudioGalleryProvider'

const SPEAKER: StudioCard = {
  tab: 'speakers',
  title: 'Ada Lovelace – speaker card',
  alt: 'Speaker card for Ada Lovelace, speaking on “Tracing everything” at Cloud Native Days Norway 2026.',
  subject: { type: 'speaker', id: 'sp-ada', name: 'Ada Lovelace' },
}
const MEME: StudioCard = { tab: 'meme-generator', title: '' }

function FakeCard({ label, fill }: { label: string; fill: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-xl text-white"
      style={{ width: 256, height: 256, background: fill }}
    >
      <span className="text-2xl font-bold">{label}</span>
      <span className="text-sm opacity-80">Cloud Native Days Norway</span>
    </div>
  )
}

const saved = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return { _id: 'asset-new', softOnSocial: true }
}

const meta = {
  title: 'Systems/Marketing/PromoStudio/SaveToGallery',
  component: StudioGalleryProvider,
  args: { orgId: 'org-storybook', uploader: fn(saved), children: null },
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.get('/api/trpc/marketing.task.get', () =>
          HttpResponse.json({
            result: {
              data: {
                task: {
                  _id: 'render-save-the-date',
                  _rev: 'revision-1',
                  title: 'Save the date',
                  kind: 'studioRender',
                  subject: null,
                },
              },
            },
          }),
        ),
      ],
    },
  },
  decorators: [withPortalTheme],
  render: (args) => (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
      <StudioGalleryProvider {...args}>
        <div className="flex flex-wrap gap-8">
          <DownloadableImage filename="ada-speaker-spotlight" studio={SPEAKER}>
            <FakeCard label="Ada Lovelace" fill="#be185d" />
          </DownloadableImage>
          <DownloadableImage filename="meme" studio={MEME}>
            <FakeCard label="Friday deploys" fill="#1e3a8a" />
          </DownloadableImage>
        </div>
      </StudioGalleryProvider>
    </div>
  ),
} satisfies Meta<typeof StudioGalleryProvider>
export default meta
type Story = StoryObj<typeof meta>

/** Every studio card offers "Save to gallery" beside Download. */
export const Cards: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getAllByRole('button', { name: 'Save to gallery' }),
    ).toHaveLength(2)
    await expect(
      canvas.queryByRole('button', { name: 'Attach to Task' }),
    ).toBeNull()
  },
}

/** A speaker card: title, alt and subject prefilled. */
export const SpeakerCardDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Save to gallery' })[0],
    )
    const body = within(canvasElement.ownerDocument.body)
    const form = await body.findByRole(
      'form',
      { name: 'Save to gallery' },
      { timeout: 10_000 },
    )
    await expect(within(form).getByLabelText('Title')).toHaveValue(
      SPEAKER.title,
    )
    await expect(within(form).getByLabelText('Alt text')).toHaveValue(
      SPEAKER.alt,
    )
    await expect(within(form).getByText('Ada Lovelace')).toBeInTheDocument()
  },
}
export const SpeakerCardDialogDark: Story = {
  ...SpeakerCardDialog,
  globals: { theme: 'dark' },
}
export const SpeakerCardDialogMobile: Story = {
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async (context) => {
    await SpeakerCardDialog.play!(context)
    // Below `sm` the dialog is a bottom sheet spanning the whole width.
    const body = within(context.canvasElement.ownerDocument.body)
    const panel = body
      .getByRole('form', { name: 'Save to gallery' })
      .closest('[id^="headlessui-dialog-panel"]') as HTMLElement
    const width =
      context.canvasElement.ownerDocument.documentElement.clientWidth
    await expect(Math.round(panel.getBoundingClientRect().width)).toBe(width)
  },
}

/** The free-form editor knows no subject: both fields are asked for. */
export const FreeFormDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Save to gallery' })[1],
    )
    const body = within(canvasElement.ownerDocument.body)
    const form = await body.findByRole(
      'form',
      { name: 'Save to gallery' },
      { timeout: 10_000 },
    )
    await expect(within(form).getByLabelText('Title')).toHaveValue('')
    await expect(within(form).getByLabelText('Alt text')).toHaveValue('')
    await expect(
      within(form).getByRole('button', { name: 'Save' }),
    ).toBeDisabled()
    await expect(within(form).getByText(/No subject/)).toBeInTheDocument()
  },
}

/** Saved: a link to the gallery, and the soft-on-social warning. */
export const Saved: Story = {
  play: async (context) => {
    const { canvasElement, args } = context
    await SpeakerCardDialog.play!(context)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Save' }))
    await expect(
      await body.findByRole('status', {}, { timeout: 5_000 }),
    ).toHaveTextContent('is in the gallery')
    await expect(body.getByText(/may look soft on social/)).toBeInTheDocument()
    await expect(
      body.getByRole('link', { name: 'Open the gallery' }),
    ).toHaveAttribute('href', '/admin/marketing/assets')
    await expect(args.uploader).toHaveBeenCalledTimes(1)
  },
}
export const SavedDark: Story = { ...Saved, globals: { theme: 'dark' } }

/** With a render Task open: attach to Task and Save to gallery side by side. */
export const WithTask: Story = {
  render: (args) => (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
      <StudioGalleryProvider {...args}>
        <StudioTaskProvider taskId="render-save-the-date">
          <DownloadableImage filename="ada-speaker-spotlight" studio={SPEAKER}>
            <FakeCard label="Ada Lovelace" fill="#be185d" />
          </DownloadableImage>
        </StudioTaskProvider>
      </StudioGalleryProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('button', { name: 'Attach to Task' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Save to gallery' }),
    ).toBeInTheDocument()
  },
}
export const WithTaskMobile: Story = {
  ...WithTask,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async (context) => {
    await WithTask.play!(context)
    // Three buttons do not fit one row on a phone: they wrap, none clipped.
    const canvas = within(context.canvasElement)
    const top = (name: string) =>
      canvas.getByRole('button', { name }).getBoundingClientRect().top
    await expect(top('Save to gallery')).toBeGreaterThan(top('Download as PNG'))
    const width =
      context.canvasElement.ownerDocument.documentElement.clientWidth
    for (const button of canvas.getAllByRole('button')) {
      await expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
        width,
      )
    }
  },
}

// ── An exported video (#1182) ─────────────────────────────────────────────

/** Stands in for the export panel: the real clip, handed over on click. */
function ExportedClip({ origin }: { origin: VideoOrigin }) {
  const gallery = useGallerySave()!
  return (
    <button
      type="button"
      className="rounded-md border px-3 py-1.5 text-sm font-medium text-brand-cloud-blue dark:border-gray-600 dark:text-blue-400"
      onClick={async () => {
        const blob = await (await fetch('/storybook-fixtures/clip.mp4')).blob()
        gallery.saveVideo(
          {
            blob,
            poster: async () => new Blob(['poster'], { type: 'image/jpeg' }),
          },
          origin,
        )
      }}
    >
      Save to gallery
    </button>
  )
}

const videoRender =
  (origin: VideoOrigin): Story['render'] =>
  (args) => (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
      <StudioGalleryProvider {...args}>
        <ExportedClip origin={origin} />
      </StudioGalleryProvider>
    </div>
  )

async function openVideoDialog(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Save to gallery' }),
  )
  return within(canvasElement.ownerDocument.body).findByRole(
    'form',
    { name: 'Save video to gallery' },
    { timeout: 10_000 },
  )
}

/** From a saved project: its title prefilled, alt text asked for. */
export const SaveVideoToGallery: Story = {
  render: videoRender({
    title: 'Launch teaser',
    projectId: 'vp-launch',
    sources: [],
  }),
  play: async ({ canvasElement }) => {
    const form = within(await openVideoDialog(canvasElement))
    await expect(form.getByLabelText('Title')).toHaveValue('Launch teaser')
    await expect(form.getByLabelText('Alt text')).toHaveValue('')
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(form.queryByText(/not saved as a project/)).toBeNull()
  },
}
export const SaveVideoToGalleryDark: Story = {
  ...SaveVideoToGallery,
  globals: { theme: 'dark' },
}
export const SaveVideoToGalleryMobile: Story = {
  ...SaveVideoToGallery,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
}

/** An unsaved video: the gallery will not be able to reopen it. */
export const SaveVideoToGalleryUnsaved: Story = {
  render: videoRender({
    title: 'Untitled video',
    projectId: null,
    sources: [],
  }),
  play: async ({ canvasElement }) => {
    const form = within(await openVideoDialog(canvasElement))
    await expect(
      form.getByText(/This video is not saved as a project/),
    ).toBeInTheDocument()
  },
}
export const SaveVideoToGalleryUnsavedDark: Story = {
  ...SaveVideoToGalleryUnsaved,
  globals: { theme: 'dark' },
}

/** Saved: the same confirmation as an image's. */
export const SaveVideoToGallerySaved: Story = {
  ...SaveVideoToGallery,
  play: async (context) => {
    const { canvasElement, args } = context
    const form = within(await openVideoDialog(canvasElement))
    await userEvent.type(
      form.getByLabelText('Alt text'),
      'Five scenes counting down to the keynote.',
    )
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByRole('status', {}, { timeout: 5_000 }),
    ).toHaveTextContent('Launch teaser is in the gallery.')
    await expect(args.uploader).toHaveBeenCalledTimes(1)
  },
}
