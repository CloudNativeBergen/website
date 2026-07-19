import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyAreasView } from './MyAreasView'
import type { MyAreasData } from '@/lib/dashboard/data-types'

/**
 * TEAMS-3 (L4) "My areas" — per-team needs-attention counts for the teams the
 * viewer belongs to, each deep-linking to its filtered surface. Stories exercise
 * the presentational {@link MyAreasView} (the widget's data wrapper hits a server
 * action). Empty `areas` is the inert state for a viewer on no team.
 */
const meta = {
  title: 'Admin/Dashboard/MyAreasWidget',
  component: MyAreasView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : 'p-4'}>
        <div className="mx-auto h-full w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MyAreasView>

export default meta
type Story = StoryObj<typeof meta>

const data: MyAreasData = {
  areas: [
    {
      key: 'cfp',
      title: 'Programme',
      metrics: [
        {
          label: 'Needs reply',
          count: 4,
          href: '/admin/messages?view=needs-reply',
        },
        {
          label: 'Unassigned',
          count: 2,
          href: '/admin/messages?view=unassigned',
        },
      ],
    },
    {
      key: 'sponsors',
      title: 'Sales',
      metrics: [
        {
          label: 'Unassigned sponsors',
          count: 0,
          href: '/admin/sponsors/crm?assignedTo=unassigned',
        },
      ],
    },
    {
      key: 'volunteers',
      title: 'Crew',
      metrics: [
        {
          label: 'Pending volunteers',
          count: 7,
          href: '/admin/volunteers',
        },
      ],
    },
  ],
}

export const Default: Story = { args: { data } }

export const Dark: Story = {
  args: { data },
  parameters: { dark: true },
}

export const NoTeams: Story = {
  args: { data: { areas: [] } },
}
