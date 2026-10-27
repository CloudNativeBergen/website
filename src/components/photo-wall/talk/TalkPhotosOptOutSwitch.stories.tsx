import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  SelfTalkPhotosOptOutSwitch,
  TalkPhotosOptOutSwitch,
} from './TalkPhotosOptOutSwitch'

// The global Session/TRPC decorators provide the providers; MSW answers the
// `speaker.setTalkPhotosOptOut` mutation.
const handlers = [
  http.post('/api/trpc/speaker.setTalkPhotosOptOut', () =>
    HttpResponse.json({
      result: { data: { talkPhotosOptOut: true, talkPhotosOptOutAt: null } },
    }),
  ),
]

const meta = {
  title: 'Systems/PhotoWall/TalkPhotosOptOutSwitch',
  component: TalkPhotosOptOutSwitch,
  parameters: { layout: 'padded', msw: { handlers } },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TalkPhotosOptOutSwitch>

export default meta
type Story = StoryObj<typeof meta>

/** The speaker's switch on the dashboard and profile (talk photos spec §7.4). */
export const Self: Story = {
  args: { stored: undefined },
  render: (args) => <SelfTalkPhotosOptOutSwitch stored={args.stored} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', {
      name: 'Hide photos of my talks from public pages',
    })
    await expect(box).not.toBeChecked()
    await userEvent.click(box)
    await expect(await canvas.findByText('Saved.')).toBeVisible()
    await expect(box).toBeChecked()
  },
}
export const SelfDark: Story = { ...Self, globals: { theme: 'dark' } }

/** An organizer in the speaker editor, the speaker already opted out. */
export const OrganizerLocked: Story = {
  args: { stored: true, onChange: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox')).toBeDisabled()
    await expect(canvas.getByText(/only they can undo it/)).toBeVisible()
  },
}
export const OrganizerLockedDark: Story = {
  ...OrganizerLocked,
  globals: { theme: 'dark' },
}
