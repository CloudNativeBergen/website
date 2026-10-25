import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { ScaleIcon } from '@heroicons/react/24/outline'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { InfoCard } from '@/app/(admin)/admin/settings/settingsLayout'
import { ContentJudgementSettings } from './ContentJudgementSettings'

/**
 * The Content judgement card on /admin/settings (Content judgement spec §5):
 * an organizer turns Jev on for the organization, and the card says who last
 * changed it and when. Shown inside the settings page's real `InfoCard`.
 *
 * Dark mode: this file's own decorator reads `parameters.theme`.
 */

const ok = [
  http.post('/api/trpc/organization.updateContentJudgement', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]
const refused = [
  http.post('/api/trpc/organization.updateContentJudgement', () =>
    HttpResponse.json(
      {
        error: {
          message: 'Failed to update content judgement',
          code: -32603,
          data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
        },
      },
      { status: 500 },
    ),
  ),
]

const meta = {
  title: 'Systems/Settings/ContentJudgementSettings',
  component: ContentJudgementSettings,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: ok },
  },
  args: { enabled: false },
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
              <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
                <div className="mx-auto max-w-xl">
                  <InfoCard title="Content judgement" icon={ScaleIcon}>
                    <Story />
                  </InfoCard>
                </div>
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ContentJudgementSettings>

export default meta
type Story = StoryObj<typeof meta>

/** Every organization starts here. */
export const NeverChanged: Story = {}

export const On: Story = {
  args: {
    enabled: true,
    changedAt: '2026-10-25T11:42:00Z',
    changedByName: 'Kari Nordmann',
  },
}

export const OnDark: Story = {
  args: On.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Turned off again by an organizer who has since been erased. */
export const OffByFormerOrganizer: Story = {
  args: {
    enabled: false,
    changedAt: '2026-10-25T11:42:00Z',
    changedByName: null,
  },
}

export const NeverChangedDark: Story = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

export const TurnsOn: Story = {
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole('switch', { name: 'Judge content' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(
      await canvas.findByText('Content judgement on'),
    ).toBeInTheDocument()
  },
}

/** A refused save puts the switch back and says so. */
export const RollsBackOnError: Story = {
  parameters: { msw: { handlers: refused } },
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole('switch', { name: 'Judge content' })
    await userEvent.click(toggle)
    await expect(await canvas.findByText('Could not save')).toBeInTheDocument()
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  },
}
