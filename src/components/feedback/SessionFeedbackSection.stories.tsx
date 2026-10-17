import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { SessionFeedbackSection } from './SessionFeedbackSection'

const ENDPOINT = '/api/trpc/sessionFeedback.ensureCode'

const answer = (data: unknown) =>
  http.post(ENDPOINT, () => HttpResponse.json({ result: { data } }))

const BEFORE = {
  code: 'k7m2qx',
  url: 'https://2026.cloudnativedays.no/f/k7m2qx',
  window: {
    state: 'before',
    opensAt: '2026-10-29T08:00:00.000Z',
    lastSlotEnd: '2026-10-29T08:40:00.000Z',
    closesAt: '2026-10-30T08:40:00.000Z',
    feedbackVisible: false,
  },
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/SessionFeedbackSection',
  component: SessionFeedbackSection,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Full-width section at the top of `/cfp/proposal/[id]` for a confirmed talk. Calls `sessionFeedback.ensureCode` on mount, which mints the Feedback Code on first view. Renders nothing when the server refuses the talk or will not mint a code. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
    msw: { handlers: [answer(BEFORE)] },
  },
  args: { talkId: 'talk-1' },
} satisfies Meta<typeof SessionFeedbackSection>

export default meta
type Story = StoryObj<typeof meta>

export const Loaded: Story = {}

export const LoadedDark: Story = { globals: { theme: 'dark' } }

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, async () => {
          await delay('infinite')
          return HttpResponse.json({})
        }),
      ],
    },
  },
}

export const LoadFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, () =>
          HttpResponse.json(
            {
              error: {
                message: 'Internal error',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
              },
            },
            { status: 500 },
          ),
        ),
      ],
    },
  },
}

/** A talk whose window closed before it ever had a code: nothing renders. */
export const NoCode: Story = {
  parameters: {
    msw: {
      handlers: [
        answer({
          code: null,
          url: null,
          window: { ...BEFORE.window, state: 'closed' },
        }),
      ],
    },
  },
}
