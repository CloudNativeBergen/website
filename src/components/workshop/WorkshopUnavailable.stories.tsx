import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WorkshopUnavailable } from './WorkshopUnavailable'

/**
 * The workshop portal on a host that cannot sign in yet (#1298). The attendee
 * learns that sign-up is not available and whom to write to — and nothing
 * about why.
 *
 * Dark mode is resolved by the LOCAL decorator below from `parameters.dark`,
 * so the `*Dark` story is dark regardless of the toolbar.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Story />
    </div>
  </div>
)

const meta = {
  title: 'Systems/Workshops/PortalUnavailable',
  component: WorkshopUnavailable,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: {
    conferenceTitle: 'Cloud Native Days Norway 2026',
    contactEmail: 'hello@cloudnativedays.no',
  },
} satisfies Meta<typeof WorkshopUnavailable>

export default meta
type Story = StoryObj<typeof meta>

export const Unavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'Workshop sign-up for Cloud Native Days Norway 2026 is not available yet.',
      ),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Workshop Signup' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(
        /If you have a workshop ticket and need help, contact the organizers at/,
      ),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/Please check back later/),
    ).toBeInTheDocument()
    // Both ways to reach the organizers: the address in the text and the button.
    await expect(
      canvas.getByRole('link', { name: 'hello@cloudnativedays.no' }),
    ).toHaveAttribute('href', 'mailto:hello@cloudnativedays.no')
    await expect(
      canvas.getByRole('link', { name: 'Contact the organizers' }),
    ).toHaveAttribute('href', 'mailto:hello@cloudnativedays.no')
    // Nothing to start a sign-in with.
    await expect(
      canvas.queryByRole('button', { name: /sign in|sign up/i }),
    ).toBeNull()
    await expect(
      canvas.queryByRole('link', { name: /sign in|sign up/i }),
    ).toBeNull()
    for (const link of canvas.getAllByRole('link')) {
      await expect(link.getAttribute('href')).toMatch(/^mailto:/)
    }
  },
}

export const UnavailableDark: Story = { parameters: { dark: true } }

/** A long conference name and address, on a phone: nothing may overflow. */
export const UnavailableLongTitleMobile: Story = {
  args: {
    conferenceTitle:
      'KubeCon + CloudNativeCon Europe Community Co-located Workshop Days 2026',
    // ONE unbroken token, wider than the phone: only `break-words` keeps it
    // inside the viewport, so the play below fails if that is removed.
    contactEmail:
      'workshopregistrationhelpdesk@kubeconcommunityworkshopdays.example.org',
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

export const UnavailableMobileDark: Story = {
  parameters: { dark: true, viewport: { defaultViewport: 'mobile1' } },
}
