import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { RoomFeedbackCodeCards } from './RoomFeedbackCodes'

const code = (talkId: string, title: string, short: string) => ({
  talkId,
  title,
  url: `https://cloudnativedays.no/f/${short}`,
})

const PAIR = [
  code('t1', 'Platform engineering without the platform team', 'k7m2qx'),
  code('t2', 'eBPF in production: what we learned the hard way', 'rpt234'),
]

const meta = {
  title: 'Systems/Feedback/Public/RoomFeedbackCodes',
  component: RoomFeedbackCodeCards,
  parameters: { layout: 'fullscreen' },
  args: { codes: PAIR },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Rate the talks' }),
    ).toBeVisible()
    await expect(
      await canvas.findAllByRole('img', { name: /QR code for feedback/ }),
    ).toHaveLength(PAIR.length)
    await expect(canvas.getByText('cloudnativedays.no/f/k7m2qx')).toBeVisible()
  },
} satisfies Meta<typeof RoomFeedbackCodeCards>

export default meta
type Story = StoryObj<typeof meta>

/** Two talks back to back, shown in the break after them. */
export const BackToBack: Story = {}

export const BackToBackDark: Story = { globals: { theme: 'dark' } }

export const Single: Story = {
  args: { codes: PAIR.slice(0, 1) },
  play: undefined,
}

export const ThreeDark: Story = {
  args: {
    codes: [...PAIR, code('t3', 'Sikkerhet på toppen av Kubernetes', 'zzz234')],
  },
  globals: { theme: 'dark' },
  play: undefined,
}
