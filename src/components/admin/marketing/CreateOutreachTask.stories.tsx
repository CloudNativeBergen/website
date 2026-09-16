import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { mockDateBeforeEach } from '@/lib/storybook'
import { CreateOutreachTask } from './CreateOutreachTask'

const meta = {
  title: 'Systems/Marketing/Admin/CreateOutreachTask',
  component: CreateOutreachTask,
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
            result: { data: { taskId: 'created-outreach' } },
          }),
        ),
      ],
    },
  },
} satisfies Meta<typeof CreateOutreachTask>
export default meta
type Story = StoryObj<typeof meta>

export const Speaker: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Add outreach task' }),
    )
    const modal = within(document.body)
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
      within(canvasElement).getByRole('button', { name: 'Add outreach task' }),
    )
    const modal = within(document.body)
    await userEvent.selectOptions(
      await modal.findByLabelText('Recipient type'),
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
