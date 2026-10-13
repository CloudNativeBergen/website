import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { http, HttpResponse } from 'msw'
import { expect, within } from 'storybook/test'
import WorkshopList from './WorkshopList'
import {
  WorkshopEarlyAccessBanner,
  WorkshopEarlyAccessInvalidNotice,
} from './WorkshopEarlyAccess'
import { mockDateBeforeEach } from '@/lib/storybook'

/**
 * EARLY ACCESS ON THE WORKSHOP PORTAL (#1346, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §7), one story per situation of
 * the table.
 *
 * `Portal` is the part of the signed-in portal page that early access changes,
 * composed as `src/app/(workshop)/workshop/page.tsx` composes it: the notice,
 * the early-access banner in the place of the one naming the official opening,
 * and the list. The components are the real ones; the page itself is a server
 * component and is asserted in `portal-early-access.test.tsx`.
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

interface PortalProps {
  /** The person's own link is live: the sponsor it belongs to. */
  earlyAccess?: { sponsorName: string | null }
  /** The sponsor start time, handed over only with early access. */
  sponsorStart?: string
  /** The sponsor start time is still ahead: the banner names it. */
  beforeSponsorStart?: boolean
  /** They just opened a link that is not live. */
  linkNotLive?: boolean
}

function Portal({
  earlyAccess,
  sponsorStart,
  beforeSponsorStart,
  linkNotLive,
}: PortalProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:max-w-4xl lg:px-12">
      <h1 className="font-display text-4xl font-bold tracking-tighter text-blue-600 sm:text-5xl dark:text-blue-400">
        Workshop Signup
      </h1>
      {linkNotLive && <WorkshopEarlyAccessInvalidNotice />}
      {earlyAccess && (
        <WorkshopEarlyAccessBanner
          sponsorName={earlyAccess.sponsorName}
          opensAt={beforeSponsorStart ? sponsorStart : undefined}
        />
      )}
      <div className="mt-12">
        <WorkshopList
          userWorkOSId="workos-1"
          userEmail="attendee@example.com"
          userName="Attendee One"
          earlyAccess={!!earlyAccess}
          workshopRegistrationSponsorStart={
            earlyAccess ? sponsorStart : undefined
          }
          workshopRegistrationStart={OFFICIAL_OPENING}
          workshopRegistrationEnd={END}
        />
      </div>
    </div>
  )
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
  component: Portal,
  beforeEach: mockDateBeforeEach(NOW),
  parameters: { layout: 'fullscreen', msw: { handlers } },
  decorators: [withTheme],
} satisfies Meta<typeof Portal>

export default meta
type Story = StoryObj<typeof meta>

const dark = (story: Story): Story => ({
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

/**
 * EARLY ACCESS, BEFORE THE SPONSOR START TIME: one banner, naming the sponsor
 * and that time. Nothing can be signed up for yet.
 */
export const BeforeSponsorStart: Story = {
  args: {
    earlyAccess: { sponsorName: 'Acme AS' },
    sponsorStart: SPONSOR_START_AHEAD,
    beforeSponsorStart: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByRole('heading', { level: 3 }),
    ).toHaveTextContent(
      'Early access through Acme AS opens Friday, June 12, 2026 at 9:00 AM',
    )
    await expect(canvas.queryByText(/not yet open/)).not.toBeInTheDocument()
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
  args: {
    earlyAccess: { sponsorName: 'Acme AS' },
    sponsorStart: SPONSOR_START,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'You have early access through Acme AS',
    )
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
  beforeEach: mockDateBeforeEach(new Date('2026-06-16T12:00:00Z')),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: 'Register for Workshop' })
    await expect(sections(canvasElement)).toEqual(OFFERS)
    await expect(canvas.queryByText(/early access/i)).not.toBeInTheDocument()
  },
}
export const AfterTheOfficialOpeningDark = dark(AfterTheOfficialOpening)
export const AfterTheOfficialOpeningMobile = mobile(AfterTheOfficialOpening)

/**
 * JUST OPENED A LINK THAT IS NOT LIVE: the portal as they would otherwise see
 * it, with the one notice. (Before the official opening the page also shows
 * its banner naming that time; it is part of the page, not of this story.)
 */
export const LinkNotLive: Story = {
  args: { linkNotLive: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'This early access link is no longer valid',
    )
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
  args: {
    linkNotLive: true,
    earlyAccess: { sponsorName: 'Acme AS' },
    sponsorStart: SPONSOR_START,
  },
  play: async ({ canvasElement }) => {
    const statuses = within(canvasElement)
      .getAllByRole('status')
      .map((status) => status.textContent)
    await expect(statuses).toEqual([
      'This early access link is no longer valid',
      'You have early access through Acme AS',
    ])
  },
}

/** A sponsor whose name could not be read: the banner still says what it is. */
export const SponsorWithoutAName: Story = {
  args: { earlyAccess: { sponsorName: null }, sponsorStart: SPONSOR_START },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'You have early access through a sponsor',
    )
  },
}
