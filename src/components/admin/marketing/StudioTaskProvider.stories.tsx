import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within } from 'storybook/test'
import { DownloadableImage } from '@/components/common/DownloadableImage'
import { MarketingTabs } from '../MarketingTabs'
import { StudioTaskProvider } from './StudioTaskProvider'

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
                json: {
                  task: {
                    _id: 'render-save-the-date',
                    _rev: 'revision-1',
                    title: 'Save the date',
                    kind: 'studioRender',
                    subject: null,
                  },
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
      await canvas.findByText('Render for Task: Save the date'),
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
