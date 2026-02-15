import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorRegistrationLogoUpload } from './SponsorRegistrationLogoUpload'

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" rx="8" fill="#2563eb"/><text x="100" y="36" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20" font-weight="bold">ACME CORP</text></svg>`
const SAMPLE_SVG_BRIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><rect width="200" height="60" rx="8" fill="none" stroke="white" stroke-width="2"/><text x="100" y="36" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20" font-weight="bold">ACME CORP</text></svg>`

const meta = {
  title: 'Systems/Sponsors/Portal/SponsorRegistrationLogoUpload',
  component: SponsorRegistrationLogoUpload,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Logo upload component for the sponsor registration portal. Supports primary and bright (dark-background) SVG logo variants with preview, download, and replace functionality.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof SponsorRegistrationLogoUpload>

export default meta
type Story = StoryObj<typeof meta>

/** Empty state with no logos uploaded yet. */
export const Empty: Story = {
  args: {
    logo: null,
    logoBright: null,
    sponsorName: 'Acme Corp',
  },
}

/** Primary logo uploaded, bright variant still empty. */
export const WithPrimaryLogo: Story = {
  args: {
    logo: SAMPLE_SVG,
    logoBright: null,
    sponsorName: 'Acme Corp',
  },
}

/** Both logo variants uploaded. */
export const WithBothLogos: Story = {
  args: {
    logo: SAMPLE_SVG,
    logoBright: SAMPLE_SVG_BRIGHT,
    sponsorName: 'Acme Corp',
  },
}
