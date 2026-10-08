import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { WorkshopSignedOut } from './WorkshopSignedOut'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

/**
 * The two pieces of the attendee workshop portal that start and end a WorkOS
 * session (#1296): the signed-out view, whose buttons go to the SDK-backed
 * `/workshop/sign-in` and `/workshop/sign-up` routes, and the "Sign Out" form
 * that posts to the sign-out action.
 *
 * Dark mode is resolved by the LOCAL decorator below from `parameters.dark`,
 * so the `*Dark` stories are dark regardless of the toolbar.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Story />
    </div>
  </div>
)

const meta = {
  title: 'Systems/Workshops/PortalAuth',
  component: WorkshopSignedOut,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: { conferenceTitle: 'Cloud Native Days Norway 2026' },
} satisfies Meta<typeof WorkshopSignedOut>

export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Sign In' }).closest('form'),
    ).toHaveAttribute('action', '/workshop/sign-in')
    await expect(
      canvas.getByRole('button', { name: 'Create Account' }).closest('form'),
    ).toHaveAttribute('action', '/workshop/sign-up')
  },
}

export const SignedOutDark: Story = { parameters: { dark: true } }

/** A long conference name, on a phone: the buttons must not overflow. */
export const SignedOutLongTitleMobile: Story = {
  args: {
    conferenceTitle:
      'KubeCon + CloudNativeCon Europe Community Co-located Workshop Days 2026',
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    // The claim above, asserted: nothing is wider than the viewport, and both
    // buttons sit inside it.
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
    for (const name of ['Sign In', 'Create Account']) {
      const { right } = within(canvasElement)
        .getByRole('button', { name })
        .getBoundingClientRect()
      await expect(right).toBeLessThanOrEqual(page.clientWidth)
    }
  },
}

/**
 * The portal's header row as the page composes it: the title on the left, the
 * "Sign Out" form on the right. The button must stay on one line beside a
 * wrapping title, as the link it replaces did.
 */
function PortalHeader({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-bold tracking-tighter text-blue-600 sm:text-5xl lg:text-7xl dark:text-blue-400">
          {title}
        </h1>
        <WorkshopSignOutButton action={async () => {}} />
      </div>
    </div>
  )
}

export const SignOutInHeader: Story = {
  render: () => <PortalHeader title="Workshop Signup" />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Sign Out',
    })
    await expect(button).toHaveAttribute('type', 'submit')
    await expect(button.closest('form')).not.toBeNull()
  },
}

export const SignOutInHeaderDark: Story = {
  render: () => <PortalHeader title="Workshop Access Required" />,
  parameters: { dark: true },
}
