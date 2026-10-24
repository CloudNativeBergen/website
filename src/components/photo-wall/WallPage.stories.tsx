import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { ComposerPlaceholder, ScreenPlaceholder } from './WallPage'

/**
 * The three `/wall` routes as slice M1 leaves them (Photo Wall spec §2,
 * §4.1): placeholders inside their minimal chrome, which later slices fill.
 */
const meta = {
  title: 'Systems/PhotoWall/WallRoutes',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'The public Photo Wall routes as slice M1 ships them: `/wall` and `/wall/post` in their minimal chrome (the conference logo, no site navigation, the visitor’s light or dark setting), and `/wall/screen` always dark with no chrome. Dark mode follows the global `theme` toolbar (story-level `globals`); Screen Mode is dark by its own `dark` class.',
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
