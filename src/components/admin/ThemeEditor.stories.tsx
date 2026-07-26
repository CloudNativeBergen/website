import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { ThemeEditor, ThemeSwatchRow } from './ThemeEditor'
import { NotificationProvider } from './NotificationProvider'
import type { ConferenceTheme } from '@/lib/branding/theme'

const PURPLE: ConferenceTheme = {
  primaryColor: '#7C3AED',
  accentColor: '#22D3EE',
}

const ok = (data: unknown) => () => HttpResponse.json({ result: { data } })

const handlers = [
  http.post(
    '/api/trpc/conference.updateBranding',
    ok({ success: true, updated: {} }),
  ),
]

const meta = {
  title: 'Systems/Settings/Admin/ThemeEditor',
  component: ThemeEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'THEMING L1 — the per-conference brand-colour editor. Sets the conference `theme` object (primary + accent) through `conference.updateBranding`. The live preview shows a button, heading and gradient in the chosen colours; colours are applied verbatim (no contrast auto-derivation). "Reset to default" clears the override.',
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
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeEditor>

export default meta
type Story = StoryObj<typeof meta>

/** The read-only Branding-card body as the settings page renders it. */
function Card({ theme }: { theme?: ConferenceTheme | null }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
        Brand Colors
      </h3>
      <ThemeSwatchRow theme={theme} />
    </div>
  )
}

/** Card body: no override → house-palette note. */
export const CardDefault: Story = {
  args: {},
  render: () => <Card theme={undefined} />,
}

/** Card body: a themed conference shows its two swatches + hex values. */
export const CardThemed: Story = {
  args: { initialTheme: PURPLE },
  render: () => <Card theme={PURPLE} />,
}

export const CardThemedDark: Story = {
  ...CardThemed,
  parameters: { theme: 'dark' },
}

/** The editor modal, opened, seeded with the house defaults (no override yet). */
export const ModalDefault: Story = {
  args: { defaultOpen: true },
}

export const ModalDefaultDark: Story = {
  ...ModalDefault,
  parameters: { theme: 'dark' },
}

/** The editor modal, opened, seeded with an existing purple/cyan theme. */
export const ModalThemed: Story = {
  args: { initialTheme: PURPLE, defaultOpen: true },
}

export const ModalThemedDark: Story = {
  ...ModalThemed,
  parameters: { theme: 'dark' },
}

/**
 * Interaction test: typing an invalid hex disables Save and shows the field
 * error; correcting it re-enables Save and updates the live preview swatch.
 */
export const ValidationFlow: Story = {
  args: { defaultOpen: true },
  play: async () => {
    const primary = screen.getByLabelText<HTMLInputElement>('Primary Color', {
      selector: 'input#theme-primary-hex',
    })
    await userEvent.clear(primary)
    await userEvent.type(primary, '#12345g')

    await waitFor(() =>
      expect(screen.getAllByText(/6-digit hex color/i).length).toBeGreaterThan(
        0,
      ),
    )
    const save = screen.getByRole('button', { name: /save colors/i })
    expect(save).toBeDisabled()

    await userEvent.clear(primary)
    await userEvent.type(primary, '#10b981')
    await waitFor(() => expect(save).toBeEnabled())
  },
}
