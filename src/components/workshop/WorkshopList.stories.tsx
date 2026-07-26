import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { http, HttpResponse, delay } from 'msw'
import type { Decorator } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import WorkshopList from './WorkshopList'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { mockDateBeforeEach } from '@/lib/storybook'

// The public attendee workshop signup list. Its three on-mount queries
// (`workshop.list`, `workshop.getMySignups`, `workshop.announcements` — one per
// card) plus the signup/cancel mutations are all mocked at the tRPC HTTP
// boundary via MSW. NOTE #606 removed the `conference` prop; the current props
// are identity + registration-window only.

const NOW = new Date('2026-09-01T12:00:00Z')

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const listResponse = (workshops: unknown[]) =>
  trpc({ success: true, data: workshops, count: workshops.length })

const makeWorkshop = (
  id: string,
  title: string,
  available: number,
  overrides: Partial<Record<string, unknown>> = {},
) =>
  ({
    _id: id,
    title,
    format: 'workshop_120',
    capacity: 30,
    signups: 30 - available,
    available,
    waitlistCount: available === 0 ? 4 : 0,
    // startTime/endTime are "HH:MM" (the shape `formatTime12Hour` and the
    // overlap check expect) — NOT full ISO datetimes.
    date: '2026-09-10',
    startTime: '09:00',
    endTime: '11:00',
    room: 'Workshop Room A',
    description:
      'A hands-on introduction with the Operator SDK. Bring a laptop with ' +
      'kubectl and Docker installed.',
    speakers: [
      {
        _id: `sp-${id}`,
        name: 'Grace Hopper',
        slug: 'grace-hopper',
        title: 'Principal Engineer, CloudCorp',
        image: 'https://placehold.co/80x80/3b82f6/ffffff?text=GH',
      },
    ],
    topics: [{ _id: 't-1', title: 'Kubernetes', color: '#3b82f6' }],
    ...overrides,
  }) as unknown as ProposalWithWorkshopData

const wsAvailableA = makeWorkshop(
  'ws-1',
  'Getting Started with Kubernetes Operators',
  18,
)
const wsAvailableB = makeWorkshop(
  'ws-2',
  'Progressive Delivery with Argo Rollouts',
  6,
  {
    startTime: '13:00',
    endTime: '15:00',
    room: 'Workshop Room B',
  },
)
const wsFull = makeWorkshop('ws-3', 'Zero-Trust Networking Deep Dive', 0, {
  date: '2026-09-11',
  startTime: '09:00',
  endTime: '11:00',
  room: 'Workshop Room C',
})

const signup = (
  id: string,
  wsId: string,
  status: 'confirmed' | 'waitlist',
) => ({
  _id: id,
  _type: 'workshopSignup',
  status,
  workshop: { _type: 'reference', _ref: wsId },
})

const signupsResponse = (signups: unknown[]) =>
  trpc({ success: true, data: signups, count: signups.length })

const announcementsHandler = http.get('/api/trpc/workshop.announcements', () =>
  trpc({ success: true, data: [], count: 0 }),
)

/** Base handlers: everything resolves; individual stories override `workshop.list`. */
const handlersFor = (workshops: unknown[], signups: unknown[] = []) => [
  http.get('/api/trpc/workshop.list', () => listResponse(workshops)),
  http.get('/api/trpc/workshop.getMySignups', () => signupsResponse(signups)),
  announcementsHandler,
  http.post('/api/trpc/workshop.signup', () =>
    trpc({ message: 'Successfully signed up for the workshop!' }),
  ),
  http.post('/api/trpc/workshop.cancelSignup', () => trpc({ success: true })),
]

// A component (not the bare decorator closure) so `useEffect` is rules-of-hooks
// clean. Mirrors `.dark` onto `<html>` for the portaled signup modal.
function ThemeFrame({
  dark,
  children,
}: {
  dark: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <div className={dark ? 'dark' : ''}>
      <div className={dark ? 'bg-gray-950 p-4' : 'bg-white p-4'}>
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
    </div>
  )
}

const withTheme: Decorator = (Story, ctx) => (
  <ThemeFrame dark={!!ctx.parameters.dark}>
    <Story />
  </ThemeFrame>
)

const signedInArgs = {
  userWorkOSId: 'workos-1',
  userEmail: 'attendee@example.com',
  userName: 'Attendee One',
}

const meta = {
  title: 'Systems/Workshops/WorkshopList',
  component: WorkshopList,
  beforeEach: mockDateBeforeEach(NOW),
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Attendee-facing workshop signup list: your workshops, available, and full sections, plus loading / empty / registration-window gating and the signup success & error banners. tRPC is mocked via MSW.',
      },
    },
  },
  decorators: [withTheme],
} satisfies Meta<typeof WorkshopList>

export default meta
type Story = StoryObj<typeof meta>

/** Workshops query in flight → the loading placeholder. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/workshop.list', async () => {
          await delay('infinite')
          return listResponse([])
        }),
        http.get('/api/trpc/workshop.getMySignups', () => signupsResponse([])),
        announcementsHandler,
      ],
    },
  },
}

/** Guest view: available workshops plus a full one (no personal signups). */
export const AvailableAndFull: Story = {
  parameters: {
    msw: { handlers: handlersFor([wsAvailableA, wsAvailableB, wsFull]) },
  },
}

export const AvailableAndFullDark: Story = {
  parameters: {
    dark: true,
    msw: { handlers: handlersFor([wsAvailableA, wsAvailableB, wsFull]) },
  },
}

/** Signed-in attendee with a confirmed + a waitlisted signup: "Your Workshops". */
export const Registered: Story = {
  args: signedInArgs,
  parameters: {
    msw: {
      handlers: handlersFor(
        [wsAvailableA, wsAvailableB, wsFull],
        [
          signup('su-1', 'ws-1', 'confirmed'),
          signup('su-2', 'ws-3', 'waitlist'),
        ],
      ),
    },
  },
}

export const RegisteredDark: Story = {
  args: signedInArgs,
  parameters: {
    dark: true,
    msw: {
      handlers: handlersFor(
        [wsAvailableA, wsAvailableB, wsFull],
        [
          signup('su-1', 'ws-1', 'confirmed'),
          signup('su-2', 'ws-3', 'waitlist'),
        ],
      ),
    },
  },
}

/** No workshops configured → the empty-state card. */
export const Empty: Story = {
  parameters: { msw: { handlers: handlersFor([]) } },
}

/**
 * Registration window has closed: the available/full sections are gated off,
 * but a registered attendee still sees "Your Workshops".
 */
export const RegistrationClosed: Story = {
  args: { ...signedInArgs, workshopRegistrationEnd: '2026-08-01T00:00:00Z' },
  parameters: {
    msw: {
      handlers: handlersFor(
        [wsAvailableA, wsFull],
        [signup('su-1', 'ws-1', 'confirmed')],
      ),
    },
  },
}

/** Completing the signup modal surfaces the green success banner. */
export const SignupSuccess: Story = {
  args: signedInArgs,
  parameters: { msw: { handlers: handlersFor([wsAvailableA]) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    await userEvent.click(
      await canvas.findByRole('button', { name: /register for workshop/i }),
    )
    await userEvent.click(
      await body.findByRole('button', { name: /confirm registration/i }),
    )
    await canvas.findByText(/successfully signed up/i)
  },
}

/** A failing signup mutation surfaces the red error banner. */
export const SignupError: Story = {
  args: signedInArgs,
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/workshop.list', () => listResponse([wsAvailableA])),
        http.get('/api/trpc/workshop.getMySignups', () => signupsResponse([])),
        announcementsHandler,
        http.post('/api/trpc/workshop.signup', () =>
          HttpResponse.json(
            {
              error: {
                message: 'This workshop is now full.',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR' },
              },
            },
            { status: 500 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(document.body)
    await userEvent.click(
      await canvas.findByRole('button', { name: /register for workshop/i }),
    )
    await userEvent.click(
      await body.findByRole('button', { name: /confirm registration/i }),
    )
    // The failure text shows both in the modal and in the page-level banner, so
    // assert on all matches rather than a single one.
    await body.findAllByText(/this workshop is now full/i)
  },
}
