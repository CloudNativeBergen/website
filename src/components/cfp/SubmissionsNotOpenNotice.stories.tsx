import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SubmissionsNotOpenNotice } from './SubmissionsNotOpenNotice'

/**
 * Replaces the "Submit your proposal" CTA on the public `/cfp` page when the
 * conference has configured no session formats — the state every freshly
 * provisioned tenant starts in. Honest copy beats a button that leads to a
 * form with an empty format dropdown.
 */
const meta = {
  title: 'Systems/Proposals/SubmissionsNotOpenNotice',
  component: SubmissionsNotOpenNotice,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof SubmissionsNotOpenNotice>

export default meta
type Story = StoryObj<typeof meta>

export const WithContactEmail: Story = {
  args: { contactEmail: 'cfp@brand-new.example' },
}

/** No contact address configured — the offer to email is simply dropped. */
export const WithoutContactEmail: Story = {
  args: {},
}
