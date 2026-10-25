/**
 * THROWAWAY PROTOTYPE (wayfinder #1571, Content Judgement).
 *
 * Question: how does a Judgement look and behave on the Photo Wall
 * moderation queue, where one call gives a Wall Post TWO Judgements (caption
 * and photo), an organizer works from a phone at a live event, and Jev only
 * advises?
 *
 * Three structurally different variants:
 * - A · Badge on card: an amber "Check first" strip on the existing card
 *   naming which part raised it and why; the queue order is unchanged
 *   (oldest first); photos always shown; after a decision the flag stays as
 *   a grey "Flagged before approval" chip.
 * - B · Triage sections: Pending is split into Check first (strongest flag
 *   first) / Looks fine / Not judged; the section carries the verdict, the
 *   card only the reasons; Approve all is scoped to the Looks fine section.
 * - C · Covered photos: a flagged photo is blurred behind its reason until
 *   tapped (Show photo); a flagged caption is marked inline with a chip; the
 *   quiet verdicts (Looks fine, Not judged) sit in the meta row; once a
 *   human decided, the photo is plain and the marks turn grey.
 *
 * Fixtures cover every reason on both parts, a looks-fine post, a post with
 * no caption, a post not judged at all, a post whose photo alone was not
 * judged, an approved post Jev had flagged (organizer overrode), a rejected
 * flagged post and a `deleting` post. Nothing here is a real person.
 */

import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  PrototypeQueue,
  type Answers,
  type JudgedPost,
  type Judged,
} from './ModerationQueue.prototype'

const LANDSCAPE = {
  url: '/storybook-fixtures/wall-landscape.jpg',
  width: 1600,
  height: 1000,
}
const PORTRAIT = {
  url: '/storybook-fixtures/wall-portrait.jpg',
  width: 1200,
  height: 1600,
}
const PHOTO = {
  url: '/storybook-fixtures/wall-photo.jpg',
  width: 1200,
  height: 1600,
}

const LOW: Answers = {
  abusive: 0.02,
  sexual: 0.01,
  spam: 0.03,
  personal_info: 0.01,
}
const fine: Judged = { judged: true, answers: LOW }
const judged = (over: Partial<Answers>): Judged => ({
  judged: true,
  answers: { ...LOW, ...over },
})
const notJudged: Judged = { judged: false }

let n = 0
const post = (fields: Partial<JudgedPost>): JudgedPost => ({
  _id: `wallPost-${++n}`,
  status: 'pending',
  photo: LANDSCAPE,
  crop: { x: 0.5, y: 0.5 },
  caption: null,
  name: null,
  marketingConsent: false,
  submittedAt: '2026-10-26T07:30:00Z',
  approvedAt: null,
  decidedAt: null,
  incarnation: { createdAt: null, assetId: null },
  judgement: { caption: fine, photo: fine },
  ...fields,
})

const POSTS: JudgedPost[] = [
  // Pending, oldest first as the real queue sorts it.
  post({
    caption: 'Keynote crowd, first morning',
    name: 'Ada',
    marketingConsent: true,
    crop: { x: 0, y: 0.5 },
    submittedAt: '2026-10-26T07:31:00Z',
  }),
  // Caption: personal_info (a fake number). Photo fine.
  post({
    caption: 'Ring meg på 040 12 345 hvis du vil ha stickers!',
    name: 'Bo',
    submittedAt: '2026-10-26T07:33:00Z',
    judgement: { caption: judged({ personal_info: 0.91 }), photo: fine },
  }),
  // Photo: sexual. Caption fine.
  post({
    photo: PORTRAIT,
    crop: { x: 0.5, y: 1 },
    caption: 'Afterparty 🎉',
    name: 'Cy',
    submittedAt: '2026-10-26T07:35:00Z',
    judgement: { caption: fine, photo: judged({ sexual: 0.78 }) },
  }),
  // Not judged at all: Jev was off or slow.
  post({
    caption: 'Hallway track',
    name: 'Di',
    crop: { x: 1, y: 0.5 },
    submittedAt: '2026-10-26T07:38:00Z',
    judgement: { caption: notJudged, photo: notJudged },
  }),
  // Both: caption abusive, photo personal_info (a readable badge).
  post({
    photo: PHOTO,
    caption: 'Den foredragsholderen er en idiot, slutt å invitere ham',
    name: 'Eli',
    submittedAt: '2026-10-26T07:40:00Z',
    judgement: {
      caption: judged({ abusive: 0.86 }),
      photo: judged({ personal_info: 0.63 }),
    },
  }),
  // No caption at all; photo fine.
  post({
    photo: PORTRAIT,
    crop: { x: 0.5, y: 0 },
    submittedAt: '2026-10-26T07:41:00Z',
    judgement: { photo: fine },
  }),
  // Both spam: an NFT lure in the caption, a QR code in the photo.
  post({
    caption: 'Scan for a free NFT drop 🚀 limited!',
    name: 'Finn',
    submittedAt: '2026-10-26T07:44:00Z',
    judgement: {
      caption: judged({ spam: 0.94 }),
      photo: judged({ spam: 0.71 }),
    },
  }),
  // Photo judged borderline abusive (gore / hate symbol); caption fine.
  post({
    caption: 'Lunch line',
    name: 'Gro',
    marketingConsent: true,
    submittedAt: '2026-10-26T07:47:00Z',
    judgement: { caption: fine, photo: judged({ abusive: 0.58 }) },
  }),
  // Caption judged fine, photo not judged (the image never arrived).
  post({
    caption: 'Sponsor booth, stand 4',
    name: 'Hal',
    submittedAt: '2026-10-26T07:49:00Z',
    judgement: { caption: fine, photo: notJudged },
  }),
  // Caption sexual (at a person: abusive too, below the bar).
  post({
    photo: PORTRAIT,
    caption: 'Hot speakers at this conf, call me 😏',
    name: 'Ivo',
    submittedAt: '2026-10-26T07:52:00Z',
    judgement: {
      caption: judged({ sexual: 0.72, abusive: 0.41 }),
      photo: fine,
    },
  }),
  // On the wall: an approved post Jev had flagged. The organizer overrode.
  post({
    status: 'approved',
    photo: PORTRAIT,
    crop: { x: 0.5, y: 0 },
    caption: 'Doors open',
    name: 'Jo',
    marketingConsent: true,
    submittedAt: '2026-10-26T06:50:00Z',
    approvedAt: '2026-10-26T07:10:00Z',
    decidedAt: '2026-10-26T07:10:00Z',
    judgement: { caption: fine, photo: judged({ sexual: 0.66 }) },
  }),
  post({
    status: 'approved',
    caption: 'Registration desk',
    submittedAt: '2026-10-26T06:40:00Z',
    approvedAt: '2026-10-26T07:00:00Z',
    decidedAt: '2026-10-26T07:00:00Z',
  }),
  // Not shown: a rejected flagged post, a rejected fine one, a delete that
  // did not finish (no content, no Judgement).
  post({
    status: 'notShown',
    caption: 'Kjøp billige følgere: 0912 34 567',
    name: 'Kai',
    submittedAt: '2026-10-26T07:00:00Z',
    decidedAt: '2026-10-26T07:06:00Z',
    judgement: {
      caption: judged({ spam: 0.97, personal_info: 0.81 }),
      photo: fine,
    },
  }),
  post({
    status: 'notShown',
    caption: 'Blurry',
    name: 'Liv',
    submittedAt: '2026-10-26T07:02:00Z',
    decidedAt: '2026-10-26T07:05:00Z',
  }),
  post({
    status: 'deleting',
    photo: null,
    caption: 'Gone soon',
    name: 'Mia',
    submittedAt: '2026-10-26T07:20:00Z',
    judgement: undefined,
  }),
]

/**
 * Cancels the global decorator's `p-8` for the admin layout's own
 * `px-2 sm:px-4 lg:px-8`, so a phone capture maps to the app's width.
 */
const adminInset: Decorator = (Story) => (
  <div className="-m-8 bg-white p-2 sm:p-4 lg:p-8 dark:bg-gray-900">
    <Story />
  </div>
)

const meta = {
  title: 'Prototypes/Content Judgement/Photo Wall moderation queue',
  component: PrototypeQueue,
  decorators: [adminInset],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Throwaway prototype for wayfinder #1571: three ways a Wall Post card can carry its two Judgements (caption, photo). Not wired to anything; actions change local state only. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: { posts: POSTS, variant: 'badge' },
} satisfies Meta<typeof PrototypeQueue>

export default meta
type Story = StoryObj<typeof meta>

const DARK = { globals: { theme: 'dark' } }

// --- A -------------------------------------------------------------------

export const ABadgeOnCard: Story = {
  name: 'A · Badge on card',
  args: { variant: 'badge' },
}
export const ABadgeOnCardDark: Story = {
  name: 'A · Badge on card (dark)',
  args: { variant: 'badge' },
  ...DARK,
}
export const ABadgeOnTheWall: Story = {
  name: 'A · On the wall (overridden flag)',
  args: { variant: 'badge', initialTab: 'onTheWall' },
}
export const ABadgeNotShown: Story = {
  name: 'A · Not shown',
  args: { variant: 'badge', initialTab: 'notShown' },
}

// --- B -------------------------------------------------------------------

export const BTriageSections: Story = {
  name: 'B · Triage sections',
  args: { variant: 'sections' },
}
export const BTriageSectionsDark: Story = {
  name: 'B · Triage sections (dark)',
  args: { variant: 'sections' },
  ...DARK,
}
export const BTriageOnTheWall: Story = {
  name: 'B · On the wall (overridden flag)',
  args: { variant: 'sections', initialTab: 'onTheWall' },
}

// --- C -------------------------------------------------------------------

export const CCoveredPhotos: Story = {
  name: 'C · Covered photos',
  args: { variant: 'covered' },
}
export const CCoveredPhotosDark: Story = {
  name: 'C · Covered photos (dark)',
  args: { variant: 'covered' },
  ...DARK,
}
export const CCoveredOnTheWall: Story = {
  name: 'C · On the wall (overridden flag)',
  args: { variant: 'covered', initialTab: 'onTheWall' },
}
/** Show photo reveals the first covered photo; Hide covers it again. */
export const CCoveredRevealed: Story = {
  name: 'C · Covered photos (one revealed)',
  args: { variant: 'covered' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const show = canvas.getAllByRole('button', { name: 'Show photo' })
    await userEvent.click(show[0])
    await expect(
      canvas.getAllByRole('button', { name: 'Show photo' }),
    ).toHaveLength(show.length - 1)
    await expect(canvas.getByRole('button', { name: 'Hide' })).toBeVisible()
  },
}
