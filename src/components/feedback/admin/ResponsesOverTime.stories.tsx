import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { ChartResponse } from '@/lib/feedback/buckets'
import type { FeedbackColour } from '@/lib/feedback/colour'
import { ResponsesOverTime } from './ResponsesOverTime'

/** 40 answers during and after a 09:00 Oslo session, then a burst of 40 red. */
const RESPONSES: ChartResponse[] = [
  ...Array.from({ length: 40 }, (_, i): [number, FeedbackColour] => [
    5 + Math.round((i * i) / 18),
    i % 7 === 0 ? 'yellow' : i % 11 === 0 ? 'red' : 'green',
  ]),
  ...Array.from({ length: 40 }, (_, i): [number, FeedbackColour] => [
    112 + Math.floor(i / 6),
    'red',
  ]),
].map(([minutes, colour], i) => ({
  id: `feedbackResponse-${String(i + 1).padStart(32, '0')}`,
  colour,
  submittedAt: new Date(
    Date.parse('2026-10-27T08:00:00Z') + minutes * 60_000,
  ).toISOString(),
}))

const WINDOW = {
  opensAt: '2026-10-27T08:00:00.000Z',
  closesAt: '2026-10-28T08:40:00.000Z',
}

/** Deterministic dates with real timers (AGENTS.md). */
const runningClockFrom = (start: Date) => () => {
  const realNow = Date.now
  const offset = start.getTime() - realNow()
  Date.now = () => realNow() + offset
  return () => {
    Date.now = realNow
  }
}

/** The Remove confirmation is portaled: put `dark` on the document too. */
function DocumentTheme({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return children
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/ResponsesOverTime',
  component: ResponsesOverTime,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A talk’s scanned responses in 10-minute buckets across its Feedback Window (speaker feedback spec §10.2), on its admin page. Pick a range by dragging across the bars (pointer or touch), Shift-click, or the arrow keys (Shift extends, Home/End, Escape clears); **Remove these <n>** asks with the count and removes exactly the ids shown. Dark mode follows the global `theme` toolbar (story-level `globals`), applied to the document as well because the confirmation is portaled.',
      },
    },
  },
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <div className="min-h-screen bg-white p-4 dark:bg-gray-800">
          <div className="max-w-96">
            <Story />
          </div>
        </div>
      </DocumentTheme>
    ),
  ],
  args: {
    responses: RESPONSES,
    window: WINDOW,
    onRemove: fn(async (ids: string[]) => ({ removed: ids.length, gone: 0 })),
  },
  beforeEach: runningClockFrom(new Date('2026-10-27T10:30:00Z')),
} satisfies Meta<typeof ResponsesOverTime>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DefaultDark: Story = { globals: { theme: 'dark' } }

/** The burst picked by keyboard, waiting for Remove. */
export const RangeSelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('listbox', { name: 'Responses over time' }).focus()
    await userEvent.keyboard(
      '{End}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{Shift>}{ArrowRight}{/Shift}',
    )
    expect(
      canvas.getByRole('button', { name: 'Remove these 40' }),
    ).toBeVisible()
  },
}

export const RangeSelectedDark: Story = {
  ...RangeSelected,
  globals: { theme: 'dark' },
}

/** Escape clears the range, and the Remove offer with it. */
export const EscapeClears: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    canvas.getByRole('listbox', { name: 'Responses over time' }).focus()
    await userEvent.keyboard('{End}{Shift>}{Home}{/Shift}')
    expect(
      canvas.getByRole('button', { name: 'Remove these 80' }),
    ).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(canvas.queryByRole('button', { name: /^Remove/ })).toBeNull()
  },
}

/** After the window closed: all 148 buckets of 24 h 40 min. */
export const WindowClosed: Story = {
  beforeEach: runningClockFrom(new Date('2026-11-02T12:00:00Z')),
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole('listbox')
    expect(within(chart).getAllByRole('option')).toHaveLength(148)
  },
}

export const Empty: Story = { args: { responses: [] } }
