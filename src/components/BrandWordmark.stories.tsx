import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { ConferenceLogo } from './ConferenceLogo'
import { ThemeStyle } from './ThemeStyle'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { type ConferenceTheme } from '@/lib/branding/theme'

/**
 * The GENERATED default mark, shown through the real `ConferenceLogo` — i.e.
 * exactly what a conference with no uploaded logo renders in its header, footer
 * and admin sidebar.
 *
 * This replaces a hardcoded Cloud Native Days wordmark that every unbranded
 * tenant used to inherit. Two things need to be visible in a capture:
 *   1. the mark reads as the TENANT's name, at wordmark and monogram sizes; and
 *   2. it takes the tenant's THEME — the gradient stops resolve the same
 *      `--brand-primary`/`--brand-accent` seam `TenantThemeStyle` injects, so
 *      the Themed rows must differ in colour from the Default rows.
 */

const PURPLE: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#F59E0B',
}

const NAMES = [
  'Cloud Native Day Bergen',
  'KubeCon Nordics 2027',
  'Oslo Go',
  PLATFORM_NAME,
]

function MarkSample({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="space-y-8 p-6">
      <ThemeStyle theme={theme} />
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {theme ? 'Themed tenant' : 'Default (house palette)'}
      </p>

      {NAMES.map((name) => (
        <div key={name} className="space-y-3">
          <p className="font-mono text-[11px] text-gray-400">{name}</p>
          <div className="flex flex-wrap items-center gap-6">
            <ConferenceLogo
              conference={{ title: name }}
              variant="horizontal"
              className="h-10 w-auto max-w-full"
            />
            <ConferenceLogo
              conference={{ title: name }}
              variant="mark"
              className="h-12 w-12"
            />
            <ConferenceLogo
              conference={{ title: name }}
              variant="mark"
              fallbackVariant="monochrome"
              className="h-12 w-12 text-brand-slate-gray dark:text-white"
            />
          </div>
          {/* The monochrome wordmark is what the dark admin sidebar and the
              offline page render — it must resolve currentColor, not a hue. */}
          <ConferenceLogo
            conference={{ title: name }}
            variant="horizontal"
            fallbackVariant="monochrome"
            className="h-8 w-auto max-w-full text-brand-slate-gray dark:text-white"
          />
        </div>
      ))}
    </div>
  )
}

const meta = {
  title: 'Systems/Branding/BrandWordmark',
  component: MarkSample,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The generated fallback mark for a conference with no uploaded logo: a wordmark from the tenant title and an initials monogram, both painted through the per-tenant brand seam.',
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
} satisfies Meta<typeof MarkSample>

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
