import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import type { StudioCard } from '@/components/common/image-capture'
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
  ...SpeakerCardDialog,
  parameters: {
    ...meta.parameters,
    viewport: { defaultViewport: 'mobile1' },
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
}
