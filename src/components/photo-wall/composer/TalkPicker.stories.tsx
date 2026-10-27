import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ROOM_KEY, TalkPicker } from './TalkPicker'
import { STORY_NOW, STORY_SCHEDULES } from './story-schedule'

/**
 * The composer's Talk row (Talk photos spec §6.1), on its own: the full
 * composer needs a decoded photo first. Dark mode follows the global `theme`
 * toolbar (story-level `globals`).
 */
const meta = {
  title: 'Systems/PhotoWall/Composer/TalkPicker',
  component: TalkPicker,
  parameters: {
    layout: 'padded',
    viewport: { defaultViewport: 'phone' },
  },
  args: {
    schedules: STORY_SCHEDULES,
    now: STORY_NOW,
    onChange: fn(),
  },
  beforeEach: () => {
    sessionStorage.removeItem(ROOM_KEY)
  },
} satisfies Meta<typeof TalkPicker>

export default meta
type Story = StoryObj<typeof meta>

/** No room chosen yet: nothing is tagged. */
export const ChooseRoom: Story = {}

/** The room is chosen: its running talk is suggested. */
export const Suggested: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Main stage' }))
    await expect(canvas.getByTestId('talk-tag')).toHaveTextContent(
      'now in Main stage',
    )
    await expect(args.onChange).toHaveBeenLastCalledWith('talk-a1')
  },
}

export const SuggestedDark: Story = {
  ...Suggested,
  globals: { theme: 'dark' },
}

export const ChooseRoomDark: Story = {
  globals: { theme: 'dark' },
}
