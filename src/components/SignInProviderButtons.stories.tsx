import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SignInProviderButtons } from './SignInProviderButtons'

const meta = {
  title: 'Components/Auth/SignInProviderButtons',
  component: SignInProviderButtons,
  parameters: { layout: 'padded' },
  args: {
    providers: [
      { id: 'github', name: 'GitHub' },
      { id: 'linkedin', name: 'LinkedIn' },
    ],
    handoff: false,
    signInAction: async () => {},
  },
} satisfies Meta<typeof SignInProviderButtons>

export default meta
type Story = StoryObj<typeof meta>

/** NextAuth: each button posts the sign-in server action. */
export const NextAuth: Story = {}

/** Identity tenant: each button links to /api/auth/handoff. */
export const IdentityHandoff: Story = { args: { handoff: true } }
