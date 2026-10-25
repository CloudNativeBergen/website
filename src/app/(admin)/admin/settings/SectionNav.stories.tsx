import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { SectionNav } from './settingsLayout'

/**
 * The settings jump-nav under a stand-in for the admin's mobile header (sticky,
 * z-40, 72px). After scrolling, the nav must sit directly below the header,
 * not underneath it.
 */
function NavUnderHeader() {
  return (
    <div className="bg-gray-50 dark:bg-gray-950">
      <div className="sticky top-0 z-40 h-18 bg-gray-900 lg:h-16" />
      <div className="px-2 py-4">
        <SectionNav />
        <div className="h-[3000px]" />
      </div>
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/SettingsIA/SectionNav',
  component: NavUnderHeader,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NavUnderHeader>

export default meta
type Story = StoryObj<typeof meta>

export const MobileScrolled: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    window.scrollTo(0, 1000)
    const nav = within(canvasElement).getByRole('navigation')
    await waitFor(() =>
      expect(Math.round(nav.getBoundingClientRect().top)).toBe(72),
    )
  },
}
