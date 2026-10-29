import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { SponsorActivityLog } from './SponsorActivityLog'

const day = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const activity = (
  id: string,
  sfcId: string,
  name: string,
  activityType: string,
  description: string,
  createdAt: string,
  createdBy: { _id: string; name: string } | null = null,
) => ({
  _id: id,
  _createdAt: createdAt,
  _updatedAt: createdAt,
  sponsorForConference: { _id: sfcId, sponsor: { _id: `s-${sfcId}`, name } },
  activityType,
  description,
  createdBy,
  createdAt,
})

const hans = { _id: 'org-1', name: 'Hans K.' }
const mixed = [
  activity(
    'a1',
    'sfc-1',
    'Acme',
    'stage_change',
    'Moved to Negotiating',
    day(0),
  ),
  activity(
    'a2',
    'sfc-2',
    'Beta AS',
    'call',
    'Intro call with CTO',
    day(1),
    hans,
  ),
  activity(
    'a3',
    'sfc-1',
    'Acme',
    'note',
    'Wants a booth near the stage',
    day(2),
    hans,
  ),
  activity(
    'a4',
    'sfc-3',
    'Cloudy',
    'contract_signed',
    'Contract signed',
    day(3),
  ),
  activity(
    'a5',
    'sfc-2',
    'Beta AS',
    'invoice_status_change',
    'Invoice sent',
    day(5),
  ),
]

const handlers = (items: unknown[]) => [
  http.get('/api/trpc/sponsor.crm.activities.log', () =>
    HttpResponse.json({ result: { data: { items, nextCursor: null } } }),
  ),
  http.get('/api/trpc/sponsor.crm.list', () =>
    HttpResponse.json({
      result: {
        data: [
          { _id: 'sfc-1', sponsor: { _id: 's-1', name: 'Acme' } },
          { _id: 'sfc-2', sponsor: { _id: 's-2', name: 'Beta AS' } },
          { _id: 'sfc-3', sponsor: { _id: 's-3', name: 'Cloudy' } },
        ],
      },
    }),
  ),
  http.get('/api/trpc/sponsor.crm.listOrganizers', () =>
    HttpResponse.json({ result: { data: [hans] } }),
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Activity Log',
  component: SponsorActivityLog,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/admin/sponsors/activity', query: {} },
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SponsorActivityLog>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  parameters: { msw: { handlers: handlers([]) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No activity yet')).toBeVisible()
  },
}

export const Mixed: Story = {
  parameters: { msw: { handlers: handlers(mixed) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const links = await canvas.findAllByRole('link', { name: 'Acme' })
    await expect(links[0]).toHaveAttribute(
      'href',
      '/admin/sponsors/crm?sponsor=sfc-1&view=history',
    )
  },
}

export const Filtered: Story = {
  parameters: {
    msw: {
      handlers: handlers(mixed.filter((a) => a.activityType === 'call')),
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/admin/sponsors/activity',
        query: { sponsor: 'sfc-2', type: 'call' },
      },
    },
  },
}
