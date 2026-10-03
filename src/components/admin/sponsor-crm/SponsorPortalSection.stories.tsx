import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorPortalSection } from './SponsorPortalSection'

const generateTokenHandler = http.post(
  '/api/trpc/registration.generateToken',
  () =>
    HttpResponse.json({
      result: {
        data: {
          token: 'abc-123',
          url: 'https://example.com/sponsor/portal/abc-123',
        },
      },
    }),
)

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/SponsorPortalSection',
  component: SponsorPortalSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Self-service registration section for sponsors. "Send registration email" opens the host\'s Send modal with the registration kind (#1263) — the section only raises the intent; "Copy link only" mints or reuses the portal link in place. Shows different states: initial (send email / copy link), link generated (with copy and send buttons), email sent confirmation, and registration complete.',
      },
    },
    msw: { handlers: [generateTokenHandler] },
  },
  args: {
    sponsorForConferenceId: 'sfc-123',
    onSendInvite: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorPortalSection>

export default meta
type Story = StoryObj<typeof meta>

/** The send button hands off to the host; nothing is posted from here. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Send registration email' }),
    )
    await expect(args.onSendInvite).toHaveBeenCalledTimes(1)
  },
}

export const WithExistingToken: Story = {
  args: {
    existingToken: 'existing-token-xyz',
  },
}

/** The link is shown with Copy and Resend once a registration email went out. */
export const RegistrationSent: Story = {
  args: {
    existingToken: 'existing-token-xyz',
    registrationSent: true,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Registration email sent to sponsor contacts'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Resend' }))
    await expect(args.onSendInvite).toHaveBeenCalledTimes(1)
  },
}

/** No host callback: only the link is offered. */
export const LinkOnly: Story = {
  args: {
    onSendInvite: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('button', { name: 'Send registration email' }),
    ).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Copy link only' }),
    ).toBeInTheDocument()
  },
}

export const PortalComplete: Story = {
  args: {
    portalComplete: true,
  },
}
