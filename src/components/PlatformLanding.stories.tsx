import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PlatformLanding } from './PlatformLanding'

const meta = {
  title: 'Components/PlatformLanding',
  component: PlatformLanding,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The single platform-level screen shown for any Host that resolves to no conference. Rendered by the (main) layout in place of the tenant chrome so every public page shares one unknown-host experience.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PlatformLanding>

export default meta
type Story = StoryObj<typeof meta>

/** Bare unknown-host screen — no onboarding configured (PLATFORM_SIGNUP_URL unset). */
export const Default: Story = {
  args: {},
}

/** With onboarding configured — the muted "Claim it" line links to PLATFORM_SIGNUP_URL. */
export const WithSignupUrl: Story = {
  args: {
    signupUrl: 'https://example.com/get-started',
  },
}
