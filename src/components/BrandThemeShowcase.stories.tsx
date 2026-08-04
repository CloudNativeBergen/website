import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { Button } from './Button'
import { ThemeStyle } from './ThemeStyle'
import { type ConferenceTheme } from '@/lib/branding/theme'

/**
 * THEMING L1 visual proof. Renders the public brand surfaces that a per-tenant
 * theme re-skins — the primary/outline Button, brand-text heading and the
 * `bg-brand-gradient` hero — so a shoot can compare the DEFAULT (house blue) and
 * a THEMED tenant, in light and dark.
 *
 * The themed sample renders the REAL {@link ThemeStyle}, which injects the
 * `--brand-*` seam variables on `:root` — exactly what the tenant `Layout` does
 * at runtime. The light brand tokens resolve the seam AT `:root` (an indirection
 * `--color-brand-*: var(--brand-primary, …)`), so the override MUST live on
 * `:root`; a descendant wrapper would not re-skin them. One story renders per
 * capture iframe, so the `:root` injection is isolated per shot.
 */

function BrandSample({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <ThemeStyle theme={theme} />
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {theme ? 'Themed tenant' : 'Default (house palette)'}
      </p>

      <div className="flex h-40 flex-col items-center justify-center rounded-2xl bg-brand-gradient px-6 text-center text-white shadow-lg">
        <p className="text-2xl font-bold">Cloud Native Day</p>
        <p className="mt-1 text-sm opacity-90">Bergen · 2026</p>
      </div>

      <h2 className="text-xl font-bold text-brand-cloud-blue">
        A brand-coloured heading
      </h2>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="md">
          Register now
        </Button>
        <Button variant="outline" size="md">
          Submit a talk
        </Button>
      </div>

      <div className="rounded-xl border-2 border-brand-cloud-blue p-4">
        <p className="text-sm font-medium text-brand-cloud-blue">
          Bordered callout using the brand colour.
        </p>
      </div>

      <div className="flex h-16 items-center justify-center rounded-xl bg-aqua-gradient text-sm font-semibold text-white">
        Aqua gradient (accent endpoint)
      </div>

      <div className="rounded-xl bg-brand-cloud-blue p-4 text-center text-sm font-semibold text-white">
        Solid brand surface with white label
      </div>
    </div>
  )
}

const PURPLE: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#F59E0B',
}

// A second tenant to show the seam is not hard-coded to one hue.
const TEAL: ConferenceTheme = {
  primaryColor: '#0D9488',
  accentColor: '#84CC16',
}

/**
 * Stress palettes for the DARK tints. The dark brand rules do not use the raw
 * primary — they derive shades at fixed perceptual lightness (see
 * `src/lib/branding/color.ts`), and these four sit at the corners of what a
 * tenant can pick: near-black, near-white, and two colours whose natural
 * lightness is nowhere near the dark surface band.
 */
const NAVY: ConferenceTheme = {
  primaryColor: '#0A1F44',
  accentColor: '#334155',
}
const YELLOW: ConferenceTheme = {
  primaryColor: '#FACC15',
  accentColor: '#FB923C',
}
const RED: ConferenceTheme = { primaryColor: '#DC2626', accentColor: '#F97316' }
const PASTEL: ConferenceTheme = {
  primaryColor: '#FBCFE8',
  accentColor: '#A5F3FC',
}

/**
 * The house colours stored AS a theme. This must look like the unthemed
 * Default in both schemes — storing a theme is meant to be a no-op, which is
 * only true if the dark rules derive their tints instead of using the raw
 * primary.
 */
const HOUSE: ConferenceTheme = {
  primaryColor: '#1D4ED8',
  accentColor: '#06B6D4',
}

const meta = {
  title: 'Systems/Branding/BrandThemeShowcase',
  component: BrandSample,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Public brand surfaces under THEMING L1. Compare Default vs Themed to confirm the token seam re-skins the primary colour, brand gradient and brand text — while the Default stays pixel-identical to the house palette.',
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
} satisfies Meta<typeof BrandSample>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { theme: null } }
export const DefaultDark: Story = {
  args: { theme: null },
  parameters: { theme: 'dark' },
}

export const ThemedPurple: Story = { args: { theme: PURPLE } }
export const ThemedPurpleDark: Story = {
  args: { theme: PURPLE },
  parameters: { theme: 'dark' },
}

export const ThemedTeal: Story = { args: { theme: TEAL } }
export const ThemedTealDark: Story = {
  args: { theme: TEAL },
  parameters: { theme: 'dark' },
}

/** House colours stored as a theme — should be indistinguishable from Default. */
export const ThemedHouseDark: Story = {
  args: { theme: HOUSE },
  parameters: { theme: 'dark' },
}

export const ThemedNavyDark: Story = {
  args: { theme: NAVY },
  parameters: { theme: 'dark' },
}
export const ThemedYellowDark: Story = {
  args: { theme: YELLOW },
  parameters: { theme: 'dark' },
}
export const ThemedRedDark: Story = {
  args: { theme: RED },
  parameters: { theme: 'dark' },
}
export const ThemedPastelDark: Story = {
  args: { theme: PASTEL },
  parameters: { theme: 'dark' },
}
