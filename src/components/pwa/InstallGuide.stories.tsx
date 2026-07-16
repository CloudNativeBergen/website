import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { InstallGuidePanel } from './InstallGuide'

const meta = {
  title: 'Components/PWA/InstallGuidePanel',
  component: InstallGuidePanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Presentational, platform-aware install guidance rendered on the `/install` page. The `InstallGuide` container resolves which view to show from the shared install capability (`usePwaInstall`) plus light UA detection; this pure panel renders one resolved view so every state is inspectable in isolation.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onInstall: fn(),
  },
  argTypes: {
    view: {
      control: 'radio',
      options: [
        'installed',
        'chromium',
        'ios-safari',
        'ios-other',
        'desktop-generic',
      ],
      description: 'Which resolved install view to render',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5 sm:p-8 dark:bg-gray-800 dark:ring-white/10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InstallGuidePanel>

export default meta
type Story = StoryObj<typeof meta>

/** Chromium (Android / desktop): a real one-tap Install button. */
export const Chromium: Story = {
  args: { view: 'chromium' },
}

/** iOS Safari: the manual Add-to-Home-Screen walkthrough. */
export const IOSSafari: Story = {
  args: { view: 'ios-safari' },
}

/** iOS in a non-Safari browser: cannot install, open in Safari. */
export const IOSOther: Story = {
  args: { view: 'ios-other' },
}

/** Desktop / other: best-effort browser-menu guidance. */
export const DesktopGeneric: Story = {
  args: { view: 'desktop-generic' },
}

/** Already installed / running standalone. */
export const Installed: Story = {
  args: { view: 'installed' },
}
