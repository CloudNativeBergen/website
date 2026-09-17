import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { mockDateBeforeEach } from '@/lib/storybook'
import { CreateTask } from './CreateTask'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const meta = {
  title: 'Systems/Marketing/Admin/CreateTask',
  component: CreateTask,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: { campaignId: 'campaign-cfp' },
  beforeEach: mockDateBeforeEach(new Date('2026-09-15T10:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
    msw: {
      handlers: [
        http.get('/api/trpc/speaker.admin.search', () =>
          HttpResponse.json({
            result: { data: [{ _id: 'speaker-ada', name: 'Ada Speaker' }] },
          }),
        ),
        http.get('/api/trpc/sponsor.crm.list', () =>
          HttpResponse.json({
            result: {
              data: [
                {
                  _id: 'relationship-acme',
                  sponsor: { _id: 'sponsor-acme', name: 'Acme Cloud' },
                },
              ],
            },
          }),
        ),
        http.post('/api/trpc/marketing.task.create', () =>
          HttpResponse.json({
            result: { data: { taskId: 'created-task', ceilingWarnings: [] } },
          }),
        ),
      ],
    },
  },
} satisfies Meta<typeof CreateTask>
export default meta
type Story = StoryObj<typeof meta>

export const Speaker: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Add task' }),
    )
    const modal = within(document.body)
    await userEvent.selectOptions(
      await modal.findByLabelText('Kind'),
      'speakerOutreach',
    )
    await userEvent.type(await modal.findByLabelText('Recipient'), 'Ada')
    await userEvent.click(
      await modal.findByRole('option', { name: 'Ada Speaker' }),
    )
    await expect(modal.getByLabelText('Recipient')).toHaveValue('Ada Speaker')
  },
}

export const Sponsor: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Add task' }),
    )
    const modal = within(document.body)
    await userEvent.selectOptions(
      await modal.findByLabelText('Kind'),
      'sponsorOutreach',
    )
    await modal.findByRole('option', { name: 'Acme Cloud' })
    await userEvent.selectOptions(
      modal.getByLabelText('Recipient'),
      'sponsor-acme',
    )
    await expect(modal.getByLabelText('Recipient')).toHaveValue('sponsor-acme')
  },
}

export const Publishing: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Add task' }),
    )
    const modal = within(document.body)
    await expect(await modal.findByLabelText('Channel')).toHaveValue('bluesky')
    await expect(modal.getByRole('checkbox')).not.toBeChecked()
  },
}
const selectKind = (kind: string): Story => ({
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Add task' }),
    )
    await userEvent.selectOptions(
      await within(document.body).findByLabelText('Kind'),
      kind,
    )
  },
})
export const StudioRender = selectKind('studioRender')
export const EventPageUpdate = selectKind('eventPageUpdate')
export const Checklist = selectKind('checklist')
export const MobilePublishing: Story = {
  ...Publishing,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
