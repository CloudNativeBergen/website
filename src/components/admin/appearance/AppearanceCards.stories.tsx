import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { PatternCard } from './PatternCard'
import { ThemeCard } from './ThemeCard'
import { BACKGROUND_PATTERN_VALUES } from '@/lib/conference/backgroundPattern'
import type { ConferenceTheme } from '@/lib/branding/theme'

/**
 * State matrix for the two Appearance cards whose whole job is to SHOW the
 * current value — the pair the owner reported as unreadable ("the only way to
 * see the currently selected values is opening the modal").
 *
 * Each row must render the thing itself: swatches + hex + gradient bar for the
 * palette, a real static render of the pattern for each option. A capture where
 * a tile is blank, or where the card says "using the default palette", is the
 * bug.
 */

const CUSTOM: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#22D3EE',
}

function EditPencil() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
      <PencilSquareIcon className="h-5 w-5" />
    </span>
  )
}

function Matrix({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="space-y-6">
      <ThemeCard theme={theme} action={<EditPencil />} />
      {BACKGROUND_PATTERN_VALUES.map((pattern) => (
        <PatternCard
          key={pattern}
          pattern={pattern}
          primaryColor={theme?.primaryColor}
          accentColor={theme?.accentColor}
          action={<EditPencil />}
        />
      ))}
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/AppearanceCards',
  component: Matrix,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story: React.ComponentType, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-[100dvh] bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
              <div className="mx-auto max-w-3xl">
                <Story />
              </div>
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof Matrix>

export default meta
type Story = StoryObj<typeof meta>

/** A conference with its own palette, and every pattern option selected once. */
export const Custom: Story = { args: { theme: CUSTOM } }

export const CustomDark: Story = {
  args: { theme: CUSTOM },
  parameters: { theme: 'dark' },
}

/** Nothing stored — the house palette, shown rather than described. */
export const HouseDefault: Story = { args: { theme: null } }

export const HouseDefaultDark: Story = {
  args: { theme: null },
  parameters: { theme: 'dark' },
}
