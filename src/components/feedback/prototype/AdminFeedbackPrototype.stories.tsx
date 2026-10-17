import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  AdminFeedbackPrototype,
  type Resp,
  type TalkRow,
} from './AdminFeedbackPrototype'

/**
 * PROTOTYPE (#1422) — throwaway. Three variants of the admin Session Feedback
 * page. Deterministic mock data; one talk carries a night-time spam burst.
 */
const withTheme: Decorator = (Story, context) => (
  <div className={context.parameters.dark ? 'dark' : ''}>
    <Story />
  </div>
)

const COMMENTS = [
  'Best demo of the day.',
  'Slides please!',
  'Great pacing, clear examples.',
  'Too much intro, wanted more depth.',
  'Hard to read the code from the back row.',
  'Would love a follow-up workshop on this.',
  'The speaker is an idiot and should not be allowed on stage.',
  'Mic was too quiet.',
]

function gen(
  id: string,
  g: number,
  y: number,
  r: number,
  start: number,
  opts: { comments?: number; flagIdx?: number; burst?: number } = {},
): Resp[] {
  const out: Resp[] = []
  const push = (
    colour: Resp['colour'],
    i: number,
    minute: number,
    day = 'Wed',
  ) =>
    out.push({
      id: `${id}-${out.length}`,
      colour,
      day,
      at: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      comment:
        out.length < (opts.comments ?? 0)
          ? COMMENTS[(i + id.length) % COMMENTS.length]
          : undefined,
    })
  let i = 0
  for (const [colour, n] of [
    ['green', g],
    ['yellow', y],
    ['red', r],
  ] as const)
    for (let k = 0; k < n; k++, i++) push(colour, i, start + ((i * 7) % 55))
  if (opts.burst)
    for (let k = 0; k < opts.burst; k++)
      push('red', k, 23 * 60 + 10 + (k % 3), 'Wed')
  if (opts.flagIdx !== undefined) {
    out[opts.flagIdx].comment = COMMENTS[6]
    out[opts.flagIdx].flagged = true
  }
  return out.sort((a, b) => (a.day + a.at).localeCompare(b.day + b.at))
}

const talks: TalkRow[] = [
  {
    id: 't1',
    title: 'KRO-nicles: Composing Kubernetes Resources Without the Glue Code',
    speakers: 'I. Hansen, L. Berg',
    format: 'Talk',
    slot: 'Wed 10:40',
    cards: { green: 12, yellow: 3, red: 1 },
    responses: gen('t1', 31, 8, 2, 11 * 60 + 20, { comments: 6 }),
  },
  {
    id: 't2',
    title: 'eBPF for the Rest of Us',
    speakers: 'M. Olsen',
    format: 'Talk',
    slot: 'Wed 11:40',
    responses: gen('t2', 22, 4, 1, 12 * 60 + 20, { comments: 4, flagIdx: 2 }),
  },
  {
    id: 't3',
    title: 'Platform Engineering Is a Product',
    speakers: 'S. Dahl',
    format: 'Keynote',
    slot: 'Wed 09:00',
    responses: gen('t3', 120, 30, 9, 9 * 60 + 40, { comments: 7 }),
  },
  {
    id: 't4',
    title: 'GitOps at 3 AM: War Stories',
    speakers: 'K. Nilsen',
    format: 'Talk',
    slot: 'Wed 14:00',
    responses: gen('t4', 18, 6, 3, 14 * 60 + 40, { comments: 3, burst: 38 }),
  },
  {
    id: 't5',
    title: 'Lightning: Helm Is Fine, Actually',
    speakers: 'A. Lie',
    format: 'Lightning',
    slot: 'Wed 15:20',
    responses: gen('t5', 2, 0, 0, 15 * 60 + 30, { comments: 1 }),
  },
  {
    id: 't6',
    title: 'Hands-on: Building Operators in Go',
    speakers: 'E. Strand, T. Moe',
    format: 'Workshop',
    slot: 'Thu 09:00',
    responses: gen('t6', 14, 5, 2, 12 * 60, { comments: 4 }),
  },
  {
    id: 't7',
    title: 'Cost-Aware Autoscaling',
    speakers: 'J. Bakke',
    format: 'Talk',
    slot: 'Thu 11:00',
    responses: gen('t7', 9, 12, 6, 11 * 60 + 40, { comments: 5 }),
  },
]

const meta = {
  title: 'Prototypes/SpeakerFeedback/AdminPage',
  component: AdminFeedbackPrototype,
  parameters: { layout: 'fullscreen' },
  decorators: [withTheme],
  args: { variant: 'A', talks },
} satisfies Meta<typeof AdminFeedbackPrototype>

export default meta
type Story = StoryObj<typeof meta>

export const ATable: Story = {}
export const BInbox: Story = { args: { variant: 'B' } }
export const CDrill: Story = { args: { variant: 'C' } }
export const CDrillSpamTalk: Story = {
  args: {
    variant: 'C',
    talks: [talks[3], ...talks.filter((t) => t.id !== 't4')],
  },
}
export const ATableDark: Story = { parameters: { dark: true } }
