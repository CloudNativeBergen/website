import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import { MarketingTabs } from '../MarketingTabs'
import { StudioTaskProvider } from './StudioTaskProvider'
import { FormatSwitch, SpeakerCard } from './studio-cards'

const meta = {
  title: 'Systems/Marketing/PromoStudio',
  component: StudioTaskProvider,
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
} satisfies Meta<typeof StudioTaskProvider>
export default meta

type Story = StoryObj<typeof meta>

export const SubjectlessTask: Story = {
  args: { taskId: 'render-save-the-date', children: null },
  render: (args) => (
    <div className="p-4">
      <StudioTaskProvider {...args}>
        <MarketingTabs
          defaultTab="conference"
          tabs={[
            {
              id: 'meme',
              name: 'Memes',
              icon: 'sparkles',
              count: 1,
              description: 'Create a meme.',
            },
            {
              id: 'conference',
              name: 'Conference',
              icon: 'presentation',
              count: 1,
              description: 'Create a conference promotional image.',
            },
            {
              id: 'gallery',
              name: 'Gallery',
              icon: 'photo',
              count: 1,
              description: 'Choose photos.',
            },
            {
              id: 'speakers',
              name: 'Speakers',
              icon: 'users',
              count: 1,
              description: 'Create speaker cards.',
            },
            {
              id: 'sponsors',
              name: 'Sponsors',
              icon: 'trophy',
              count: 1,
              description: 'Create sponsor cards.',
            },
          ]}
        >
          <div>Meme generator</div>
          <DownloadableImage filename="save-the-date">
            <div className="flex h-48 w-72 flex-col justify-center rounded-xl bg-blue-900 p-6 text-white">
              <p className="text-xs font-semibold tracking-widest uppercase">
                Cloud Native Days
              </p>
              <h2 className="mt-3 text-3xl font-bold">Save the date</h2>
              <p className="mt-2">A day of ideas and community.</p>
            </div>
          </DownloadableImage>
          <div>Photo gallery</div>
          <div>Speaker cards</div>
          <div>Sponsor cards</div>
        </MarketingTabs>
      </StudioTaskProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Render for Task: Save the date', undefined, {
        timeout: 5000,
      }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Attach to Task' }),
    ).toBeVisible()
    await expect(canvas.getAllByRole('tab')).toHaveLength(5)
    await userEvent.click(canvas.getByRole('tab', { name: /Speakers/ }))
    await expect(canvas.getByText('Speaker cards')).toBeVisible()
    await userEvent.click(canvas.getByRole('tab', { name: /Conference/ }))
  },
}

export const PlaceholderHandoffFailure: Story = {
  ...SubjectlessTask,
  parameters: {
    msw: {
      handlers: [
        ...meta.parameters.msw.handlers,
        http.post('/api/admin/marketing-studio-image', () =>
          HttpResponse.json({
            assetId: 'image-saved',
            taskRev: 'revision-2',
          }),
        ),
        http.post('/api/trpc/marketing.task.attachAsset', () =>
          HttpResponse.json({
            result: {
              data: {
                success: true,
                handoffFailures: ['post-1'],
                handoffIssues: [
                  'Fill in {tier} in the alt text before scheduling.',
                ],
              },
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Attach to Task' }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Fill in {tier} in the alt text before scheduling.',
    )
    // The alert renders as soon as the response lands; `busy` clears in the
    // attach handler's `finally`, so the control settles enabled a tick later.
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Retry attachment / handoff' }),
      ).toBeEnabled(),
    )
  },
}

/** Only the gallery save failed (#1165): the attach stands, retry offered. */
export const GallerySaveFailure: Story = {
  ...SubjectlessTask,
  parameters: {
    msw: {
      handlers: [
        ...meta.parameters.msw.handlers,
        http.post('/api/admin/marketing-studio-image', () =>
          HttpResponse.json({
            assetId: 'image-saved',
            taskRev: 'revision-2',
          }),
        ),
        http.post('/api/trpc/marketing.task.attachAsset', () =>
          HttpResponse.json({
            result: {
              data: {
                success: true,
                handoffFailures: [],
                galleryFailed: true,
              },
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Attach to Task' }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The render is done and saved. It has not been saved to the asset gallery yet. Retry here or from the Task editor.',
    )
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Retry attachment / handoff' }),
      ).toBeEnabled(),
    )
  },
}

export const GallerySaveFailureDark: Story = {
  ...GallerySaveFailure,
  // This file has no decorator of its own: the global one reads the global.
  globals: { theme: 'dark' },
}

const QR =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L40,10 L40,40 L10,40 Z M80,10 L110,10 L110,40 L80,40 Z M10,80 L40,80 L40,110 L10,110 Z M60,60 L70,60 L70,70 L60,70 Z' fill='black'/%3e%3c/svg%3e"

/**
 * The landscape render of a speaker beat, opened from its Task (Formats spec
 * §4): the banner names the Format the Task asks for, the switch is preset to
 * it, and a card switched to another Format is refused before it is made.
 */
export const LandscapeSpeakerTask: Story = {
  args: { taskId: 'render-ada-landscape', children: null },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/marketing.task.get', () =>
          HttpResponse.json({
            result: {
              data: {
                task: {
                  _id: 'render-ada-landscape',
                  _rev: 'revision-1',
                  title: 'Render: Speaker card',
                  kind: 'studioRender',
                  format: 'landscape',
                  subject: { _id: 'sp-ada', type: 'speaker', name: 'Ada' },
                },
              },
            },
          }),
        ),
      ],
    },
  },
  render: (args) => (
    <div className="p-4">
      <StudioTaskProvider {...args}>
        <FormatSwitch defaultFormat="landscape">
          <div style={{ width: 420 }}>
            <DownloadableImage
              filename="speaker-ada"
              studio={{ tab: 'speakers', title: 'Ada Lovelace' }}
            >
              <div style={{ width: 420 }}>
                <SpeakerCard
                  speaker={{
                    name: 'Ada Lovelace',
                    title: 'Analytical Engineer, Babbage & Co',
                    talks: [
                      {
                        title: 'Notes on the Analytical Engine',
                        format: 'presentation_45',
                      },
                    ],
                  }}
                  qrCodeUrl={QR}
                  variant="speaker-spotlight"
                  eventName="Cloud Native Days Norway"
                  showCloudNativePattern
                />
              </div>
            </DownloadableImage>
          </div>
        </FormatSwitch>
      </StudioTaskProvider>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/This Task asks for Landscape \(1200×628\)\./),
    ).toBeVisible()
    await expect(
      canvas.getByRole('radio', { name: /Landscape/ }),
    ).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(canvas.getByRole('radio', { name: /Square/ }))
    await userEvent.click(
      canvas.getByRole('button', { name: 'Attach to Task' }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This Task asks for Landscape (1200×628), and the studio is showing Square (1080×1080). Switch the studio to Landscape, or change the Format on the Task.',
    )
  },
}

export const LandscapeSpeakerTaskDark: Story = {
  ...LandscapeSpeakerTask,
  // This file has no decorator of its own: the global one reads the global.
  globals: { theme: 'dark' },
}
