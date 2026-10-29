import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect, useState, type ComponentProps } from 'react'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within } from 'storybook/test'
import { WorkshopPortal } from './WorkshopPortal'
import { WorkshopNoTicket } from './WorkshopNoTicket'
import { mockDateBeforeEach } from '@/lib/storybook'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'

/**
 * EARLY ACCESS ON THE WORKSHOP PORTAL (#1346, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §7), one story per situation of
 * the table.
 *
 * THE COMPONENTS ARE THE ONES THE PAGE RENDERS: `WorkshopPortal` for a person
 * the portal admits and `WorkshopNoTicket` for one it does not (the signed-out
 * view with the notice is in `Systems/Workshops/PortalAuth`). What the page
 * itself decides (who is admitted, whether a link is live) is asserted in
 * `__tests__/app/workshop/portal-early-access.test.tsx`; here `registration`
 * is what the window rule answers for the story's times at the pinned clock.
 *
 * The clock is pinned to Wednesday 10 June 2026, 14:00 in Oslo. Dark mode is
 * resolved by the LOCAL decorator below from `parameters.dark`.
 */
const NOW = new Date('2026-06-10T12:00:00Z')
/** Monday 8 June, 09:00 in Oslo: two days ago. */
const SPONSOR_START = '2026-06-08T07:00:00.000Z'
/** Friday 12 June, 09:00 in Oslo: two days ahead. */
const SPONSOR_START_AHEAD = '2026-06-12T07:00:00.000Z'
/** Monday 15 June, 10:00 in Oslo. */
const OFFICIAL_OPENING = '2026-06-15T08:00:00.000Z'
const END = '2026-09-01T07:00:00.000Z'
/** The day after the official opening. */
const LATER = new Date('2026-06-16T12:00:00Z')

const ACME = { sponsorName: 'Acme AS' }
/** One word of 82 letters: nothing in it lets a line break by itself. */
const LONG_NAME =
  'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft AS'
const LONG = { sponsorName: LONG_NAME }

/** The portal's props for these times, at `now`, with or without early access. */
function portal(
  sponsorStart: string,
  earlyAccess: { sponsorName: string | null } | null,
  now = NOW,
) {
  const times = {
    workshopRegistrationSponsorStart: sponsorStart,
    workshopRegistrationStart: OFFICIAL_OPENING,
    workshopRegistrationEnd: END,
  }
  return {
    times,
    earlyAccess,
    registration: workshopRegistrationWindow(times, {
      now,
      earlyAccess: !!earlyAccess,
    }),
  }
}

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const workshop = (
  id: string,
  title: string,
  available: number,
  startTime: string,
  endTime: string,
) => ({
  _id: id,
  title,
  format: 'workshop_120',
  capacity: 30,
  signups: 30 - available,
  available,
  waitlistCount: available === 0 ? 4 : 0,
  date: '2026-09-10',
  startTime,
  endTime,
  room: 'Workshop Room A',
  description: 'A hands-on session. Bring a laptop.',
  speakers: [],
  topics: [],
})
const WORKSHOPS = [
  workshop(
    'ws-1',
    'Getting Started with Kubernetes Operators',
    18,
    '09:00',
    '11:00',
  ),
  workshop('ws-2', 'Zero-Trust Networking Deep Dive', 0, '13:00', '15:00'),
]
const handlers = [
  http.get('/api/trpc/workshop.list', () =>
    trpc({ success: true, data: WORKSHOPS, count: WORKSHOPS.length }),
  ),
  http.get('/api/trpc/workshop.getMySignups', () =>
    trpc({ success: true, data: [], count: 0 }),
  ),
  http.get('/api/trpc/workshop.announcementsByWorkshop', () =>
    trpc({ success: true, data: {} }),
  ),
]

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
      <div className="min-h-screen bg-white dark:bg-gray-950">{children}</div>
    </div>
  )
}
const withTheme: Decorator = (Story, context) => (
  <ThemeFrame dark={!!context.parameters.dark}>
    <Story />
  </ThemeFrame>
)

const meta = {
  title: 'Systems/Workshops/PortalEarlyAccess',
  component: WorkshopPortal,
  beforeEach: mockDateBeforeEach(NOW),
  parameters: { layout: 'fullscreen', msw: { handlers } },
  decorators: [withTheme],
  args: {
    conferenceTitle: 'Cloud Native Days Norway 2026',
    userWorkOSId: 'workos-1',
    userEmail: 'attendee@example.com',
    userName: 'Ada Lovelace',
    signOutAction: async () => {},
    ...portal(SPONSOR_START, null),
  },
} satisfies Meta<typeof WorkshopPortal>

export default meta
type Story = StoryObj<typeof meta>

const dark = <S extends { parameters?: object }>(story: S): S => ({
  ...story,
  parameters: { ...story.parameters, dark: true },
})
const mobile = (story: Story): Story => ({
  ...story,
  parameters: { ...story.parameters, viewport: { defaultViewport: 'mobile1' } },
  play: async (context) => {
    await story.play?.(context)
    const page = context.canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
})

const OFFERS = ['Available Workshops', 'Full Workshops']
/**
 * Banners and the workshop list's sections are both h2. The list's section
 * headings are a fixed set; every other h2 is a banner, so an unexpected
 * heading still fails one of the two assertions.
 */
const LIST_SECTIONS = ['Your Workshops', ...OFFERS]
const headings2 = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .queryAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent?.trim() ?? '')
const sections = (canvasElement: HTMLElement) =>
  headings2(canvasElement).filter((h) => LIST_SECTIONS.includes(h))
const banners = (canvasElement: HTMLElement) =>
  headings2(canvasElement).filter((h) => !LIST_SECTIONS.includes(h))
const statuses = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .queryAllByRole('status')
    .map((status) => status.textContent)

/**
 * EARLY ACCESS, BEFORE THE SPONSOR START TIME: one banner, naming the sponsor
 * and that time, in the place of the one naming the official opening. Nothing
 * can be signed up for yet.
 */
export const BeforeSponsorStart: Story = {
  args: portal(SPONSOR_START_AHEAD, ACME),
  play: async ({ canvasElement }) => {
    await expect(banners(canvasElement)).toEqual([
      'Early access through Acme AS opens Friday, June 12, 2026 at 9:00 AM',
    ])
    await expect(sections(canvasElement)).toEqual([])
  },
}
export const BeforeSponsorStartDark = dark(BeforeSponsorStart)
export const BeforeSponsorStartMobile = mobile(BeforeSponsorStart)

/**
 * EARLY ACCESS, INSIDE THE WINDOW, WITH A WORKSHOP TICKET: the line that says
 * so, and the list with sign-up enabled. A FULL WORKSHOP offers its waitlist.
 */
export const InsideTheWindow: Story = {
  args: portal(SPONSOR_START, ACME),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(statuses(canvasElement)).toEqual([
      'You have early access through Acme AS',
    ])
    await expect(banners(canvasElement)).toEqual([])
    await expect(
      await canvas.findByRole('button', { name: 'Register for Workshop' }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Join Waitlist' }),
    ).toBeEnabled()
    await expect(sections(canvasElement)).toEqual(OFFERS)
  },
}
export const InsideTheWindowDark = dark(InsideTheWindow)
export const InsideTheWindowMobile = mobile(InsideTheWindow)

/**
 * A SPONSOR WITH A LONG NAME, in both banners: the name wraps inside the
 * banner and the page does not scroll sideways (asserted at phone width).
 */
export const BeforeSponsorStartLongName: Story = {
  args: portal(SPONSOR_START_AHEAD, LONG),
  play: async ({ canvasElement }) => {
    await expect(banners(canvasElement)).toEqual([
      `Early access through ${LONG_NAME} opens Friday, June 12, 2026 at 9:00 AM`,
    ])
  },
}
export const BeforeSponsorStartLongNameDark = dark(BeforeSponsorStartLongName)
export const BeforeSponsorStartLongNameMobile = mobile(
  BeforeSponsorStartLongName,
)

export const InsideTheWindowLongName: Story = {
  args: portal(SPONSOR_START, LONG),
  play: async ({ canvasElement }) => {
    await expect(statuses(canvasElement)).toEqual([
      `You have early access through ${LONG_NAME}`,
    ])
    await within(canvasElement).findByRole('button', {
      name: 'Register for Workshop',
    })
  },
}
export const InsideTheWindowLongNameDark = dark(InsideTheWindowLongName)
export const InsideTheWindowLongNameMobile = mobile(InsideTheWindowLongName)

/**
 * A SIGN-UP REFUSED BECAUSE THE LINK WAS REVOKED while the page was open, in
 * the order it happens:
 *
 *  1. The server refuses for the window. The dialog is still open and shows
 *     the refusal; the list shows it too, and asks the page to render again.
 *     Nothing says the early access is gone yet: the page has not said so.
 *     (`…BeforeThePageRendersAgain` stops here.)
 *  2. The page renders again (here: a host that answers as the server would,
 *     without early access, after a moment). The workshops go, and the dialog
 *     with them; the banner naming the official opening is shown; the list's
 *     notice now says "Your early access is no longer valid.", stays, and has
 *     the keyboard.
 */
const REFUSAL =
  'Workshop registration opens on Monday, June 15, 2026 at 10:00 AM'
function PortalWhoseLinkIsRevoked({
  rendersAgain,
  ...args
}: ComponentProps<typeof WorkshopPortal> & { rendersAgain: boolean }) {
  const [renderedAgain, setRenderedAgain] = useState(false)
  return (
    <WorkshopPortal
      {...args}
      {...(renderedAgain ? portal(SPONSOR_START, null) : {})}
      refreshAction={async () => {
        if (!rendersAgain) return
        // As long as a round trip to the server takes.
        await new Promise((resolve) => setTimeout(resolve, 400))
        setRenderedAgain(true)
      }}
    />
  )
}
const refusedForTheWindow = {
  msw: {
    handlers: [
      ...handlers,
      http.post('/api/trpc/workshop.signup', () =>
        HttpResponse.json(
          {
            error: {
              message: REFUSAL,
              code: -32012,
              data: { code: 'PRECONDITION_FAILED', httpStatus: 412 },
            },
          },
          { status: 412 },
        ),
      ),
    ],
  },
}
/** Press "Register for Workshop" and confirm, in the dialog. */
async function signUp(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Register for Workshop' }),
  )
  // The confirmation is a dialog, rendered outside the canvas.
  const dialog = within(
    await within(canvasElement.ownerDocument.body).findByRole('dialog'),
  )
  await userEvent.click(
    await dialog.findByRole('button', { name: /confirm registration/i }),
  )
  return dialog
}

export const SignUpRefusedBeforeThePageRendersAgain: Story = {
  args: portal(SPONSOR_START, ACME),
  render: (args) => <PortalWhoseLinkIsRevoked {...args} rendersAgain={false} />,
  parameters: refusedForTheWindow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dialog = await signUp(canvasElement)

    // The dialog is still open, with the refusal in it.
    await expect(await dialog.findByText(REFUSAL)).toBeInTheDocument()
    // The list says what the server said, and nothing about the link. It
    // lies behind the dialog, and does not take the keyboard from it.
    const notice = await canvas.findByRole('alert')
    await expect(notice.textContent).toBe(REFUSAL)
    await expect(notice).not.toHaveFocus()
    await expect(statuses(canvasElement)).toEqual([
      'You have early access through Acme AS',
    ])
  },
}
export const SignUpRefusedBeforeThePageRendersAgainDark = dark(
  SignUpRefusedBeforeThePageRendersAgain,
)
export const SignUpRefusedBeforeThePageRendersAgainMobile = mobile(
  SignUpRefusedBeforeThePageRendersAgain,
)

export const SignUpRefusedAfterRevoke: Story = {
  args: portal(SPONSOR_START, ACME),
  render: (args) => <PortalWhoseLinkIsRevoked {...args} rendersAgain />,
  parameters: refusedForTheWindow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await signUp(canvasElement)
    await expect(await dialog.findByText(REFUSAL)).toBeInTheDocument()

    // The page renders again, as everyone sees it.
    await expect(
      await canvas.findByRole('heading', {
        level: 2,
        name: 'Workshop registration is not yet open',
      }),
    ).toBeInTheDocument()
    await expect(statuses(canvasElement)).toEqual([])
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
    const notice = canvas.getByRole('alert')
    await expect(notice.textContent).toBe(
      `Your early access is no longer valid. ${REFUSAL}`,
    )
    // The dialog that held the keyboard is gone: the notice has it.
    await expect(notice).toHaveFocus()
  },
}
export const SignUpRefusedAfterRevokeDark = dark(SignUpRefusedAfterRevoke)
export const SignUpRefusedAfterRevokeMobile = mobile(SignUpRefusedAfterRevoke)

/**
 * EARLY ACCESS COULD NOT BE CHECKED: the live lookup of the link failed. The
 * sign-up is refused, never let through, and the refusal says so in the
 * dialog, which stays open to try again from.
 */
const COULD_NOT_CHECK =
  'We could not check your early access right now. Please try again in a moment.'
export const EarlyAccessCouldNotBeChecked: Story = {
  args: portal(SPONSOR_START, ACME),
  parameters: {
    msw: {
      handlers: [
        ...handlers,
        http.post('/api/trpc/workshop.signup', () =>
          HttpResponse.json(
            {
              error: {
                message: COULD_NOT_CHECK,
                code: -32603,
                data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 },
              },
            },
            { status: 503 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const dialog = await signUp(canvasElement)

    await expect(await dialog.findByText(COULD_NOT_CHECK)).toBeInTheDocument()
    await expect(
      dialog.getByRole('button', { name: /confirm registration/i }),
    ).toBeEnabled()
    // The early access is as it was: nothing says it is gone.
    await expect(statuses(canvasElement)).toEqual([
      'You have early access through Acme AS',
    ])
    await expect(
      within(canvasElement).queryByText(/no longer valid/),
    ).not.toBeInTheDocument()
  },
}
export const EarlyAccessCouldNotBeCheckedDark = dark(
  EarlyAccessCouldNotBeChecked,
)
export const EarlyAccessCouldNotBeCheckedMobile = mobile(
  EarlyAccessCouldNotBeChecked,
)

/**
 * AFTER THE OFFICIAL OPENING: the portal as everyone sees it. Nothing mentions
 * early access, whatever cookie the browser still holds.
 */
export const AfterTheOfficialOpening: Story = {
  beforeEach: mockDateBeforeEach(LATER),
  args: portal(SPONSOR_START, null, LATER),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: 'Register for Workshop' })
    await expect(sections(canvasElement)).toEqual(OFFERS)
    await expect(banners(canvasElement)).toEqual([])
    await expect(statuses(canvasElement)).toEqual([])
    await expect(canvas.queryByText(/early access/i)).not.toBeInTheDocument()
  },
}
export const AfterTheOfficialOpeningDark = dark(AfterTheOfficialOpening)
export const AfterTheOfficialOpeningMobile = mobile(AfterTheOfficialOpening)

/**
 * JUST OPENED A LINK THAT IS NOT LIVE: the portal as they would otherwise see
 * it, the banner naming the official opening included, with the one notice.
 */
export const LinkNotLive: Story = {
  args: { ...portal(SPONSOR_START, null), earlyAccessInvalid: true },
  play: async ({ canvasElement }) => {
    await expect(statuses(canvasElement)).toEqual([
      'This early access link is no longer valid. Ask whoever sent it to you for a new one.',
    ])
    await expect(banners(canvasElement)).toEqual([
      'Workshop registration is not yet open',
    ])
    await expect(
      within(canvasElement).getByText(
        /Registration will open on Monday, June 15, 2026 at 10:00 AM/,
      ),
    ).toBeInTheDocument()
    await expect(sections(canvasElement)).toEqual([])
  },
}
export const LinkNotLiveDark = dark(LinkNotLive)
export const LinkNotLiveMobile = mobile(LinkNotLive)

/**
 * A link that is not live, opened by a person who still holds an older, live
 * one: the notice, and the early access they have.
 */
export const LinkNotLiveWithEarlyAccess: Story = {
  args: { ...portal(SPONSOR_START, ACME), earlyAccessInvalid: true },
  play: async ({ canvasElement }) => {
    await expect(statuses(canvasElement)).toEqual([
      'This early access link is no longer valid. Ask whoever sent it to you for a new one.',
      'You have early access through Acme AS',
    ])
  },
}

/** A sponsor whose name could not be read: the banner still says what it is. */
export const SponsorWithoutAName: Story = {
  args: portal(SPONSOR_START, { sponsorName: null }),
  play: async ({ canvasElement }) => {
    await expect(statuses(canvasElement)).toEqual([
      'You have early access through a sponsor',
    ])
  },
}

/**
 * EARLY ACCESS, SIGNED IN WITHOUT A WORKSHOP TICKET: the no-ticket view the
 * portal has today, unchanged. Nothing mentions early access, whatever cookie
 * the browser holds.
 */
type NoTicketStory = StoryObj<Meta<typeof WorkshopNoTicket>>
const noTicketArgs = {
  denial: 'no-ticket',
  reason:
    'No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at hello@example.com if you believe this is an error.',
  tickets: [{ category: 'Conference only (1 day)' }],
  contactEmail: 'hello@example.com',
  signOutAction: async () => {},
}

export const NoTicket: NoTicketStory = {
  render: () => <WorkshopNoTicket {...noTicketArgs} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Workshop Access Required',
    )
    await expect(banners(canvasElement)).toEqual(['Workshop Ticket Required'])
    await expect(statuses(canvasElement)).toEqual([])
    await expect(canvas.queryByText(/early access/i)).not.toBeInTheDocument()
  },
}
export const NoTicketDark = dark(NoTicket)
export const NoTicketMobile: NoTicketStory = {
  ...NoTicket,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async (context) => {
    await NoTicket.play?.(context)
    const page = context.canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

/** The no-ticket view for a person who just opened a link that is not live. */
export const NoTicketLinkNotLive: NoTicketStory = {
  render: () => <WorkshopNoTicket {...noTicketArgs} earlyAccessInvalid />,
  play: async ({ canvasElement }) => {
    await expect(statuses(canvasElement)).toEqual([
      'This early access link is no longer valid. Ask whoever sent it to you for a new one.',
    ])
    await expect(banners(canvasElement)).toEqual(['Workshop Ticket Required'])
  },
}
export const NoTicketLinkNotLiveDark = dark(NoTicketLinkNotLive)
export const NoTicketLinkNotLiveMobile: NoTicketStory = {
  ...NoTicketLinkNotLive,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async (context) => {
    await NoTicketLinkNotLive.play?.(context)
    const page = context.canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}
