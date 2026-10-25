import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { InformationCircleIcon, EyeIcon } from '@heroicons/react/24/outline'
import { InfoCard, FieldRow, SettingsGroupSection } from './settingsLayout'
import { SETTINGS_GROUPS } from '@/lib/settings/groups'

function Group() {
  return (
    <div className="bg-gray-50 p-4 dark:bg-gray-950">
      <SettingsGroupSection
        group={SETTINGS_GROUPS[0]}
        icon={InformationCircleIcon}
      >
        <InfoCard title="Basic Information" icon={InformationCircleIcon}>
          <FieldRow label="Title" value="Cloud Native Bergen 2026" />
        </InfoCard>
        <InfoCard title="Visibility" icon={EyeIcon}>
          <div id="visibility">
            <FieldRow label="Status" value="Live" />
          </div>
        </InfoCard>
      </SettingsGroupSection>
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/SettingsIA/CollapsibleGroup',
  component: Group,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Group>

export default meta
type Story = StoryObj<typeof meta>

/** Below lg the group starts collapsed; the header toggles it. */
export const MobileCollapsed: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = await canvas.findByRole('button', { name: /Identity/ })
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-expanded', 'false'),
    )
    await expect(canvas.queryByText('Basic Information')).not.toBeVisible()
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('Basic Information')).toBeVisible()
  },
}

/** A hash pointing at a card inside the group opens it on mobile. */
export const MobileDeepLink: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  beforeEach: () => {
    const before = window.location.hash
    window.history.replaceState(null, '', '#visibility')
    return () => window.history.replaceState(null, '', before || ' ')
  },
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole('button', {
      name: /Identity/,
    })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
  },
}

/** From lg up the group is expanded by default. */
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole('button', {
      name: /Identity/,
    })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
  },
}
