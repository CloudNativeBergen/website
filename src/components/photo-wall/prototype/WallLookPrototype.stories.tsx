import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { WallLookPrototype } from './WallLookPrototype'

/**
 * PROTOTYPE (#1478) — throwaway. Three looks for the Photo Wall, each as the
 * phone Wall page and as 1920×1080 Screen Mode. The floating bar flips look
 * (← →), page/screen, and fakes approvals, bursts and removals. Dark mode via
 * the LOCAL decorator from `parameters.dark` (page mode only; Screen Mode has
 * its own fixed palette).
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <Story />
  </div>
)

const meta = {
  title: 'Prototypes/PhotoWall/WallLook',
  component: WallLookPrototype,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: { look: 'A', mode: 'screen' },
} satisfies Meta<typeof WallLookPrototype>

export default meta
type Story = StoryObj<typeof meta>

export const AScreen: Story = {}
export const AScreenNew: Story = { args: { arriveOnMount: true } }
export const APage: Story = { args: { mode: 'page' } }
export const APageDark: Story = {
  args: { mode: 'page' },
  parameters: { dark: true },
}

export const BScreen: Story = { args: { look: 'B' } }
export const BScreenNew: Story = { args: { look: 'B', arriveOnMount: true } }
export const BScreenSquare: Story = { args: { look: 'B', square: true } }
export const BPage: Story = { args: { look: 'B', mode: 'page' } }
export const BPageDark: Story = {
  args: { look: 'B', mode: 'page' },
  parameters: { dark: true },
}

export const CScreen: Story = { args: { look: 'C' } }
export const CScreenNew: Story = { args: { look: 'C', arriveOnMount: true } }
export const CPage: Story = { args: { look: 'C', mode: 'page' } }
export const CPageDark: Story = {
  args: { look: 'C', mode: 'page' },
  parameters: { dark: true },
}
