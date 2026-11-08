import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { IdentityInvitationTemplate } from './IdentityInvitationTemplate'

/**
 * The email an identity invitation sends (#2130): org name, inviter name and
 * the accept link on id.konf.app, nothing else.
 *
 * Emails are inline-styled HTML with no dark mode, so this renders on a fixed
 * light surface deliberately.
 */
const meta = {
  title: 'Systems/Email/Identity Invitation',
  component: IdentityInvitationTemplate,
  args: {
    orgName: 'Cloud Native Bergen',
    inviterName: 'Ada Lovelace',
    invitationUrl: 'https://id.konf.app/invite/abc123',
  },
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta<typeof IdentityInvitationTemplate>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Review invitation' }),
    ).toHaveAttribute('href', 'https://id.konf.app/invite/abc123')
  },
}
