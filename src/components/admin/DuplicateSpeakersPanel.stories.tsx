import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { DuplicateSpeakersPanel } from './DuplicateSpeakersPanel'
import {
  findDuplicateSpeakerCandidates,
  type DuplicateCandidateSpeaker,
  type MergeBlockReason,
} from '@/lib/speaker/duplicates'

/**
 * The duplicate-candidates panel on `/admin/speakers` (#267).
 *
 * The stories run the REAL detector over fixture documents, so the ranking,
 * survivor suggestion and grouping shown here are the ones production computes —
 * only the tenant-scoped fetch and the merge-eligibility probe are stubbed.
 *
 * The lead fixture is the August 2026 incident itself: two documents for one
 * person sharing `ganesh-vasudevan`, the confirmed talk on the LinkedIn document
 * and the GitHub document (the one he actually signs in with) holding nothing.
 */
const meta = {
  title: 'Systems/Speakers/Admin/DuplicateSpeakersPanel',
  component: DuplicateSpeakersPanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof DuplicateSpeakersPanel>

export default meta
type Story = StoryObj<typeof meta>

interface Fixture {
  _id: string
  name: string
  slug: string
  email?: string
  knownEmails?: string[]
  providers?: string[]
  _createdAt: string
  talkCount: number
  confirmedTalkCount: number
  mergeBlockedReason?: MergeBlockReason | null
}

/** Run the real detector, then stamp the (server-computed) merge eligibility. */
function build(fixtures: Fixture[]) {
  const blocks = new Map(
    fixtures.map((fixture) => [
      fixture._id,
      fixture.mergeBlockedReason ?? null,
    ]),
  )
  return findDuplicateSpeakerCandidates<DuplicateCandidateSpeaker>(
    fixtures.map((fixture) => ({
      ...fixture,
      mergeBlockedReason: blocks.get(fixture._id) ?? null,
    })),
  )
}

const INCIDENT: Fixture[] = [
  {
    _id: '1e80d498-4878-4341-9352-00142ce180ec',
    name: 'Ganesh Vasudevan',
    slug: 'ganesh-vasudevan',
    email: 'ganesh.vasudev@gmail.com',
    providers: ['linkedin:2mtSWuh1kA'],
    _createdAt: '2026-05-05T09:12:00Z',
    talkCount: 2,
    confirmedTalkCount: 1,
  },
  {
    _id: '241e8419-208a-48c2-8e1b-7080597752d8',
    name: 'Ganesh Vasudevan',
    slug: 'ganesh-vasudevan',
    email: 'ganesh.vasudevan@ericsson.com',
    providers: ['github:23187057'],
    _createdAt: '2026-06-15T14:40:00Z',
    talkCount: 0,
    confirmedTalkCount: 0,
  },
]

const TEST_ACCOUNTS: Fixture[] = ['1', '2', '3', '4'].map((n) => ({
  _id: `test-user-${n}`,
  name: 'Test User',
  slug: 'test-user',
  email: `test+${n}@example.com`,
  providers: n === '1' ? ['github:1'] : [],
  _createdAt: `2025-0${n}-01T08:00:00Z`,
  talkCount: 0,
  confirmedTalkCount: 0,
}))

const NAMESAKES: Fixture[] = [
  {
    _id: 'anna-1',
    name: 'Anna Hansen',
    slug: 'anna-hansen',
    email: 'anna@bergen.example',
    _createdAt: '2025-11-02T10:00:00Z',
    talkCount: 1,
    confirmedTalkCount: 1,
  },
  {
    _id: 'anna-2',
    name: 'anna hansen',
    slug: 'anna-hansen-2',
    email: 'a.hansen@oslo.example',
    _createdAt: '2026-02-14T10:00:00Z',
    talkCount: 1,
    confirmedTalkCount: 0,
  },
]

const SHARED_WITH_OTHER_ORG: Fixture[] = [
  {
    _id: 'kristoffer-1',
    name: 'Kristoffer Dalby',
    slug: 'kristoffer-dalby',
    email: 'kristoffer@example.com',
    providers: ['github:77'],
    _createdAt: '2024-04-01T10:00:00Z',
    talkCount: 3,
    confirmedTalkCount: 2,
    mergeBlockedReason: 'other-organization',
  },
  {
    _id: 'kristoffer-2',
    name: 'Kristoffer Dalby',
    slug: 'kristoffer-dalby',
    email: 'kd@work.example',
    providers: ['linkedin:88'],
    _createdAt: '2026-01-20T10:00:00Z',
    talkCount: 0,
    confirmedTalkCount: 0,
    mergeBlockedReason: 'other-organization',
  },
]

/**
 * The production shape of the surface: a certain slug collision (the incident),
 * a four-way test-data collision that is NOT a person to merge, a pair another
 * organization also holds, and a same-name guess.
 */
export const Default: Story = {
  args: {
    groups: build([
      ...INCIDENT,
      ...TEST_ACCOUNTS,
      ...SHARED_WITH_OTHER_ORG,
      ...NAMESAKES,
    ]),
    scannedCount: 348,
    onMergePair: fn(),
  },
}

/** The incident on its own — the row an organizer has to read correctly. */
export const SlugCollision: Story = {
  args: {
    groups: build(INCIDENT),
    scannedCount: 348,
    onMergePair: fn(),
  },
}

/**
 * A candidate pair neither organization holds alone. `speaker.admin.merge`
 * would refuse it, so no button is offered — only the reason.
 */
export const CrossTenantAndUnmergeable: Story = {
  args: {
    groups: build(SHARED_WITH_OTHER_ORG),
    scannedCount: 348,
    onMergePair: fn(),
  },
}

/** Only a shared name: a guess, and rendered as one. */
export const WeakSignalOnly: Story = {
  args: {
    groups: build(NAMESAKES),
    scannedCount: 348,
    onMergePair: fn(),
  },
}

export const Empty: Story = {
  args: { groups: [], scannedCount: 348, onMergePair: fn() },
}

export const Loading: Story = {
  args: { groups: [], scannedCount: 0, isLoading: true, onMergePair: fn() },
}

export const Failed: Story = {
  args: {
    groups: [],
    scannedCount: 0,
    errorMessage: 'Could not resolve organization from domain',
    onMergePair: fn(),
  },
}
