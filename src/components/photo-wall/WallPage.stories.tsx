import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ComposerPlaceholder } from './WallPage'

/**
 * The `/wall/post` route on M1's placeholder (Photo Wall spec §2, §4.1), in
 * its minimal chrome. The Wall page itself is `Systems/PhotoWall/WallBoard`
 * and Screen Mode is `Systems/PhotoWall/ScreenMode`.
 */
const meta = {
  title: 'Systems/PhotoWall/WallRoutes',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'The Photo Wall route still on slice M1’s placeholder: `/wall/post` in its minimal chrome (the conference logo, no site navigation, the visitor’s light or dark setting). The Wall page `/wall` is `Systems/PhotoWall/WallBoard`; Screen Mode `/wall/screen` is `Systems/PhotoWall/ScreenMode`. Dark mode follows the global `theme` toolbar (story-level `globals`).',
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
