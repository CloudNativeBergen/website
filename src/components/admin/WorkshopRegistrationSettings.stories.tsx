import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
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
          'The workshop registration window card on /admin/workshops: a read-only card showing the open/close instants and the derived status, with a pencil opening a ModalShell form that patches the window via the workshop.admin router. A half-set window surfaces as "Partially configured" with a note mirroring the enforcement semantics (each bound is checked independently by the signup path).',
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
