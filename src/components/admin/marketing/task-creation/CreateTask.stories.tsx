import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { mockDateBeforeEach, withPortalTheme } from '@/lib/storybook'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import { CreateTask } from './CreateTask'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const milestones = resolveAllMilestones({
  startDate: '2026-11-12',
  endDate: '2026-11-13',
  cfpStartDate: '2026-03-01',
  cfpEndDate: '2026-05-15',
  cfpNotifyDate: '2026-06-15',
  programDate: '2026-08-20',
  earlyBirdEndDate: '2026-09-30',
})

const meta = {
  title: 'Systems/Marketing/Admin/CreateTask',
  component: CreateTask,
  decorators: [
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: { campaignId: 'campaign-cfp', milestones },
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
const openForm = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Add task' }),
  )
  return within(document.body)
}
/** The default: anchored on today, the resolved slot shown live. */
export const Anchored: Story = {
  play: async ({ canvasElement }) => {
    const modal = await openForm(canvasElement)
    // Tomorrow, 2026-09-16, is 14 days before Early bird ends (2026-09-30).
    await expect(await modal.findByLabelText('Milestone')).toHaveValue(
      'EARLY_BIRD_END',
    )
    await expect(modal.getByLabelText('Days from Milestone')).toHaveValue(-14)
    await expect(modal.getByText(/16\. september 2026 at 18:00/)).toBeInTheDocument()
  },
}
/** A Milestone the edition has not dated yet resolves through its fallback. */
export const AnchoredProvisional: Story = {
  play: async ({ canvasElement }) => {
    const modal = await openForm(canvasElement)
    await userEvent.selectOptions(
      await modal.findByLabelText('Milestone'),
      'SPONSOR_DEADLINE',
    )
    await expect(modal.getByText(/the day is provisional/)).toBeInTheDocument()
  },
}
/** A typed date names the nearest Milestone and offers to follow it. */
export const FixedDateSuggestion: Story = {
  play: async ({ canvasElement }) => {
    const modal = await openForm(canvasElement)
    await userEvent.click(await modal.findByLabelText('Fixed date'))
    const due = modal.getByLabelText('Due date and time (Oslo)')
    await userEvent.type(due, '2026-11-05T12:00')
    await expect(
      modal.getByText(/That is 7 days before Conference\./),
    ).toBeInTheDocument()
  },
}
export const MobileAnchored: Story = {
  ...Anchored,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
/** The modal is portaled, so dark reaches it through `withPortalTheme`. */
export const MobileAnchoredDark: Story = {
  ...MobileAnchored,
  globals: { theme: 'dark' },
}
export const MobileFixedDateSuggestion: Story = {
  ...FixedDateSuggestion,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
/** A conference missing a required date can only take a bare date. */
export const NoMilestones: Story = {
  args: { milestones: null },
  play: async ({ canvasElement }) => {
    const modal = await openForm(canvasElement)
    await expect(
      await modal.findByLabelText('Due date and time (Oslo)'),
    ).toBeInTheDocument()
  },
}
