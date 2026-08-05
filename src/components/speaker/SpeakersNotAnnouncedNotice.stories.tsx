import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakersNotAnnouncedNotice } from './SpeakersNotAnnouncedNotice'

/**
 * Replaces the speaker grid on the public `/speaker` page while no speaker has
 * been announced — the state every freshly provisioned tenant starts in, and
 * the one the `/tickets` coming-soon card links straight into. The page used
 * to say "Meet our 0 speakers" above an empty grid.
 */
const meta = {
  title: 'Systems/Speakers/SpeakersNotAnnouncedNotice',
  component: SpeakersNotAnnouncedNotice,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof SpeakersNotAnnouncedNotice>

export default meta
type Story = StoryObj<typeof meta>

/** Day one: a contact address (provisioning always sets one), no open CFP. */
export const FreshTenant: Story = {
  args: { contactEmail: 'hello@brand-new.example' },
}

/** The CFP window is open and formats exist — speakers can still get in. */
export const WithOpenCfp: Story = {
  args: { contactEmail: 'hello@brand-new.example', cfpOpen: true },
}

/** No contact address configured — the offer to email is simply dropped. */
export const WithoutContactEmail: Story = {
  args: {},
}
