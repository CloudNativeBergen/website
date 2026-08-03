import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { Footer } from './Footer'
import { ThemeStyle } from './ThemeStyle'
import { type ConferenceTheme } from '@/lib/branding/theme'
import type { Conference } from '@/lib/conference/types'

/**
 * The tenant footer — the single call site of the "Powered by Konf" platform
 * credit, and the surface where the generated fallback wordmark is most visible.
 *
 * Captures should confirm three things:
 *   1. the credit reads "Powered by Konf" and sits under the copyright line
 *      without crowding it, on mobile (stacked) and desktop (row);
 *   2. the platform name picks up the TENANT's gradient — the Themed stories
 *      must show a different hue from the Default ones; and
 *   3. an unbranded tenant's footer shows ITS OWN wordmark, not another
 *      conference's logo.
 */

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Day Bergen',
  organizer: 'Cloud Native Bergen',
  socialLinks: [
    'https://github.com/example',
    'https://bsky.app/profile/example',
  ],
} as Conference

const PURPLE: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#F59E0B',
}

function FooterSample({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="flex min-h-screen flex-col justify-end">
      <ThemeStyle theme={theme} />
      <Footer c={conference} />
    </div>
  )
}

const meta = {
  title: 'Components/Footer',
  component: FooterSample,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Tenant footer with the platform credit. The credit is the one place the platform brands a tenant surface; it is themed so it belongs to the tenant palette.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-white dark:bg-gray-950">
              <Story />
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof FooterSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { theme: null } }
export const DefaultDark: Story = {
  args: { theme: null },
  parameters: { theme: 'dark' },
}

export const Themed: Story = { args: { theme: PURPLE } }
export const ThemedDark: Story = {
  args: { theme: PURPLE },
  parameters: { theme: 'dark' },
}
