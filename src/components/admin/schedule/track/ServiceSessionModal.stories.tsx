import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { fn, userEvent, waitFor, within } from 'storybook/test'
import { ServiceSessionModal } from './ServiceSessionModal'
import type { ScheduleTrack } from '@/lib/conference/types'

// The REAL modal — it rides on ModalShell (house header with labelled 44px
// close, backdrop click-to-close, bottom sheet below `sm`, dirty-close guard)
// and derives the fitting duration options from the LIVE track passed in, so
// it stands alone with a small track fixture. Footer order follows the house
// convention: Cancel left, primary right (stacked primary-on-top on mobile).

// A track with a talk at 10:00–10:30 leaves a 60-minute gap from the 09:00
// start, so the standard 5/10/15/… duration options that fit are offered.
const track: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: 'Keynotes and headline talks',
  talks: [
    {
      placeholder: 'Opening remarks',
      startTime: '10:00',
      endTime: '10:30',
    },
  ],
}

const meta = {
  title: 'Systems/Program/Admin/ServiceSessionModal',
  component: ServiceSessionModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal for creating a service session (coffee break, lunch, networking, …) in a track. Only durations that fit the free gap until the next item are offered; the create action re-validates against the live track so a rejected add surfaces an inline error instead of silently closing. Closing with a typed-but-unsaved title first asks to confirm discarding.',
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
    isOpen: true,
    timeSlot: '09:00',
    track,
    onClose: fn(),
    onSave: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ServiceSessionModal>

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
    // The dialog is PORTALED to document.body — query there, type into the
    // labelled input, and await the confirm so the story settles.
    const body = within(document.body)
    const input = await body.findByLabelText(/session title/i)
    await userEvent.type(input, 'Coffee Break')
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      body.getByRole('alertdialog', { name: /discard unsaved changes/i }),
    )
  },
}
