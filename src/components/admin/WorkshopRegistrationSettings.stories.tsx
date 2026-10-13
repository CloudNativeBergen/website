import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within } from 'storybook/test'
import { ThemeProvider } from 'next-themes'
import { WorkshopRegistrationSettings } from './WorkshopRegistrationSettings'
import { NotificationProvider } from './NotificationProvider'

const FIXED_NOW = new Date('2026-04-15T12:00:00Z')

const handlers = [
  http.post('/api/trpc/workshop.admin.updateRegistrationTimes', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopRegistrationSettings',
  component: WorkshopRegistrationSettings,
  // Pin the clock: the status badge is derived from `new Date()` vs the window
  // bounds, so an unpinned clock would flip stories over time and thrash
  // visual diffs.
  beforeEach: () => {
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
  },
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The workshop registration window card on /admin/workshops: a read-only card showing the sponsor start, open and close instants and the derived status, with a pencil opening a ModalShell form that patches the window via the workshop.admin router. A half-set window surfaces as "Partially configured" with a note mirroring the enforcement semantics (each bound is checked independently by the signup path).',
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
} satisfies Meta<typeof WorkshopRegistrationSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Scheduled: Story = {
  args: {
    workshopRegistrationStart: '2026-05-01T07:00:00.000Z',
    workshopRegistrationEnd: '2026-06-01T07:00:00.000Z',
  },
}

export const CurrentlyOpen: Story = {
  args: {
    workshopRegistrationStart: '2026-04-01T07:00:00.000Z',
    workshopRegistrationEnd: '2026-05-01T07:00:00.000Z',
  },
}

export const Closed: Story = {
  args: {
    workshopRegistrationStart: '2026-03-01T07:00:00.000Z',
    workshopRegistrationEnd: '2026-04-01T07:00:00.000Z',
  },
}

/**
 * All three times, with the clock inside the early-access window: sponsors'
 * people are signing up, everyone else waits for the official opening.
 */
export const EarlyAccessOpen: Story = {
  args: {
    workshopRegistrationSponsorStart: '2026-04-10T07:00:00.000Z',
    workshopRegistrationStart: '2026-05-01T07:00:00.000Z',
    workshopRegistrationEnd: '2026-06-01T07:00:00.000Z',
  },
}

export const EarlyAccessOpenDark: Story = {
  args: EarlyAccessOpen.args,
  parameters: { theme: 'dark' },
}

/**
 * The phone case, pinned. `defaultViewport` is load-bearing:
 * `.storybook/test-runner.ts` reads it and resizes the page, and its default
 * is 1280, where no value wraps and the assertions below would hold for the
 * wrong reason.
 *
 * At this width a time does not fit beside its label and wraps. Every line of
 * every wrapped value must end at the row's right edge: the three rows wrap
 * alike. (The sponsor row was added right-aligned while the two older ones
 * wrapped to the left.) Measured on the lines of text, not on the elements:
 * a left-aligned value's box reaches the edge too.
 */
export const EarlyAccessOpenPhone: Story = {
  args: EarlyAccessOpen.args,
  parameters: { viewport: { defaultViewport: 'phone' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    let wrapped = 0

    for (const name of [
      'Sponsor Early Access Opens',
      'Registration Opens',
      'Registration Closes',
    ]) {
      const label = await canvas.findByText(name)
      const value = label.nextElementSibling!
      const rowRight = label.parentElement!.getBoundingClientRect().right

      const text = document.createRange()
      text.selectNodeContents(value)
      const lines = [...text.getClientRects()]
      if (lines.length > 1) wrapped += 1
      for (const line of lines) {
        await expect(Math.abs(line.right - rowRight)).toBeLessThan(1.5)
      }
      // The label and the value never touch.
      await expect(
        value.getBoundingClientRect().left -
          label.getBoundingClientRect().right,
      ).toBeGreaterThanOrEqual(16)
    }

    // CONTROL: this really is the narrow case. All three values wrapped.
    await expect(wrapped).toBe(3)
  },
}

/** Before the sponsor start time: nobody can sign up yet. */
export const ScheduledWithSponsorStart: Story = {
  args: {
    workshopRegistrationSponsorStart: '2026-04-20T07:00:00.000Z',
    workshopRegistrationStart: '2026-05-01T07:00:00.000Z',
    workshopRegistrationEnd: '2026-06-01T07:00:00.000Z',
  },
}

/** The edit form, opened: the sponsor start time comes first, with its rule. */
export const Editing: Story = {
  args: EarlyAccessOpen.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Edit Workshop Registration',
      }),
    )
    // The dialog is portalled out of the canvas.
    const dialog = await within(document.body).findByRole('dialog')
    // 07:00 UTC on 10 April is 09:00 in Oslo.
    await expect(
      within(dialog).getByLabelText(/Sponsor Early Access Opens/),
    ).toHaveValue('2026-04-10T09:00')
  },
}

export const EditingDark: Story = {
  args: Editing.args,
  play: Editing.play,
  parameters: { theme: 'dark' },
}

export const NotConfigured: Story = {
  args: {},
}

export const OnlyStartSet: Story = {
  args: {
    workshopRegistrationStart: '2026-05-01T07:00:00.000Z',
  },
}

export const OnlyEndSet: Story = {
  args: {
    workshopRegistrationEnd: '2026-05-01T07:00:00.000Z',
  },
}

export const Dark: Story = {
  args: OnlyStartSet.args,
  parameters: { theme: 'dark' },
}
