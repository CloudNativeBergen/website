import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { WidgetPicker } from './WidgetPicker'
import { withPortalTheme } from '@/lib/storybook'

// Renders the REAL WidgetPicker (not a mock shell). It was converted from a
// hand-rolled `fixed inset-0` overlay with no dialog a11y to the shared
// ModalShell (focus trap, Escape, scroll-lock, backdrop-close), and the
// category chip row now wraps instead of overflowing at phone width.

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/WidgetPicker',
  component: WidgetPicker,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Admin dashboard widget picker: search + category filters over the widget registry, grouped by category. Converted onto ModalShell for full dialog a11y; the category chip row wraps at narrow widths. Also inspect at 393px (mobile bottom-sheet) and in dark mode via the toolbar.',
      },
    },
  },
  args: {
    onSelect: fn(),
    onClose: fn(),
  },
  decorators: [withPortalTheme],
  tags: ['autodocs'],
} satisfies Meta<typeof WidgetPicker>

export default meta
type Story = StoryObj<typeof meta>

/** The picker with all widgets shown; the "Add widget" ModalShell header. */
export const Default: Story = {}

/**
 * Phone width — ModalShell presents the picker as a bottom sheet and the
 * category chip row wraps onto multiple lines instead of overflowing.
 */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
