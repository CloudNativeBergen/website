import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import {
  ChartBarIcon,
  InformationCircleIcon,
  LinkIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { InfoCard, FieldRow, SettingsGroupSection } from './settingsLayout'
import { SettingsFilter } from './SettingsFilter'
import { SETTINGS_GROUPS, type SettingsGroup } from '@/lib/settings/groups'

const GROUP: Record<string, SettingsGroup> = Object.fromEntries(
  SETTINGS_GROUPS.map((g) => [g.id, g]),
)

function FilterDemo() {
  return (
    <div className="space-y-4 bg-gray-50 p-4 dark:bg-gray-950">
      <SettingsFilter>
        <SettingsGroupSection
          group={GROUP['identity-brand']}
          icon={InformationCircleIcon}
        >
          <InfoCard title="Basic Information" icon={InformationCircleIcon}>
            <FieldRow label="Title" value="Cloud Native Bergen 2026" />
            <FieldRow label="City" value="Bergen" />
          </InfoCard>
        </SettingsGroupSection>
        <SettingsGroupSection
          group={GROUP['tickets-registration']}
          icon={TagIcon}
        >
          <InfoCard title="Ticketing" icon={LinkIcon}>
            <FieldRow label="Ticketing Provider" value="checkin" />
          </InfoCard>
          <InfoCard title="Analytics" icon={ChartBarIcon}>
            <FieldRow label="PostHog project token" value="phc_abc" />
          </InfoCard>
        </SettingsGroupSection>
      </SettingsFilter>
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/SettingsIA/SettingsFilter',
  component: FilterDemo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FilterDemo>

export default meta
type Story = StoryObj<typeof meta>

/** Field-label match on a phone: one card left, its group expanded. */
export const MobileFieldLabelMatch: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.keyboard('/')
    const input = canvas.getByRole('searchbox', { name: 'Filter settings' })
    await expect(input).toHaveFocus()
    await userEvent.type(input, 'POSTHOG')
    await waitFor(() => expect(canvas.getByText('Analytics')).toBeVisible())
    await expect(canvas.queryByText('Ticketing')).not.toBeVisible()
    await expect(canvas.queryByText('Basic Information')).not.toBeVisible()
    await expect(
      canvas.getByRole('button', { name: /Tickets & Registration/ }),
    ).toHaveAttribute('aria-expanded', 'true')
  },
}

/** Group-name match shows every card in that group. */
export const GroupNameMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('searchbox'), 'tickets')
    await waitFor(() => expect(canvas.getByText('Ticketing')).toBeVisible())
    await expect(canvas.getByText('Analytics')).toBeVisible()
    await expect(canvas.queryByText('Basic Information')).not.toBeVisible()
  },
}

/** No match: empty state, and Clear restores everything. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('searchbox'), 'zzz')
    await expect(await canvas.findByRole('status')).toHaveTextContent('zzz')
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filter' }))
    await expect(canvas.getByRole('searchbox')).toHaveValue('')
    await waitFor(() =>
      expect(canvas.getByText('Basic Information')).toBeVisible(),
    )
  },
}
