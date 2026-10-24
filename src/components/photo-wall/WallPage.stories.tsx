import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ComposerPlaceholder, ScreenPlaceholder } from './WallPage'

/**
 * The two `/wall` routes still on M1's placeholders (Photo Wall spec §2,
 * §4.1): `/wall/post` in its minimal chrome and `/wall/screen`, which later
 * slices fill. The Wall page itself is `Systems/PhotoWall/WallBoard`.
 */
const meta = {
  title: 'Systems/PhotoWall/WallRoutes',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'The Photo Wall routes still on slice M1’s placeholders: `/wall/post` in its minimal chrome (the conference logo, no site navigation, the visitor’s light or dark setting), and `/wall/screen` always dark with no chrome. The Wall page `/wall` is `Systems/PhotoWall/WallBoard`. Dark mode follows the global `theme` toolbar (story-level `globals`); Screen Mode is dark by its own `dark` class.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const logo = { title: 'Cloud Native Days Norway' }

export const Composer: Story = {
  render: () => <ComposerPlaceholder logo={logo} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        name: 'Add your photo to the wall',
      }),
    ).toBeVisible()
  },
}
export const ComposerDark: Story = {
  render: () => <ComposerPlaceholder logo={logo} />,
  globals: { theme: 'dark' },
}

/** Always dark, whatever the toolbar says. */
export const Screen: Story = {
  render: () => <ScreenPlaceholder logo={logo} />,
  parameters: { viewport: { defaultViewport: 'responsive' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Photo Wall')).toBeVisible()
    await expect(canvasElement.querySelector('.dark')).not.toBeNull()
  },
}
