import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { fn, userEvent, waitFor, within } from 'storybook/test'
import { AddTrackModal } from './AddTrackModal'

// The REAL modal — it rides on ModalShell (house header with labelled 44px
// close, backdrop click-to-close, bottom sheet below `sm`, dirty-close guard)
// and manages its own form state, so it stands alone with just the two
// callbacks. Footer order follows the house convention: Cancel on the left,
// the primary action on the right (stacked primary-on-top on mobile).

const meta = {
  title: 'Systems/Program/Admin/AddTrackModal',
  component: AddTrackModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal for adding a new track to the schedule editor: a title (required) and an optional description. Escape closes, focus is trapped and restored, the title input takes initial focus, and closing with typed-but-unsaved input first asks to confirm discarding.',
      },
    },
  },
  decorators: [
    // ModalShell reads `next-themes`; HeadlessUI portals the dialog to
    // document.body, so the toolbar's decorator wrapper never reaches it.
    // React context DOES cross portals, so forcing the theme here (synced to
    // the Storybook theme global) is what actually renders the modal dark.
    (Story, context) => (
      <ThemeProvider
        attribute="class"
        forcedTheme={context.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        <Story />
      </ThemeProvider>
    ),
  ],
  args: {
    onAdd: fn(),
    onCancel: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AddTrackModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/**
 * The dirty-close guard: a play function types into the title field and then
 * presses Escape, so the in-dialog "Discard unsaved changes?" confirm is
 * captured in screenshots.
 */
export const DirtyCloseConfirm: Story = {
  play: async () => {
    // The dialog is PORTALED to document.body — query there, not the canvas,
    // and type into the labelled input rather than relying on implicit focus.
    const body = within(document.body)
    const input = await body.findByLabelText(/track title/i)
    await userEvent.type(input, 'Platform Engineering')
    await userEvent.keyboard('{Escape}')
    // Wait for the dirty-close confirm so the story settles deterministically.
    await waitFor(() =>
      body.getByRole('alertdialog', { name: /discard unsaved changes/i }),
    )
  },
}
