import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { http, HttpResponse } from 'msw'
import { expect, within } from 'storybook/test'
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
const sections = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .queryAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
/** The headings of the banners shown. */
const banners = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .queryAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)
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
      'This early access link is no longer valid',
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
      'This early access link is no longer valid',
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
      'This early access link is no longer valid',
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
