import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import {
  GONE_SPEAKER_TEXT,
  type MentionRecord,
} from '@/lib/marketing/tagging/body'
import {
  approvalCheck,
  tagName,
  fixTagIssue,
  untagOwned,
  type TagIssue,
  type TaggablePerson,
} from '@/lib/marketing/tagging/checks'
import { TagPanel, type TagLookup } from './TagPanel'

/**
 * The Task editor's Bluesky tags (#1151, tagging spec §2, §4.3, §4.4): a tag
 * button beside each person the post is about, the note for a link that did
 * not resolve, and a refused save's issue with its one-click fix.
 */

const alice: TaggablePerson = {
  speakerId: 'spk-alice',
  name: 'Alice Anderson',
  handle: 'alice.dev',
  optedOut: false,
}
const bob: TaggablePerson = {
  speakerId: 'spk-bob',
  name: 'Bob Smith',
  handle: 'bob.bsky.social',
  optedOut: false,
}
const olga: TaggablePerson = {
  speakerId: 'spk-olga',
  name: 'Olga Nordmann',
  handle: null,
  optedOut: true,
}
const carol: TaggablePerson = {
  speakerId: 'spk-carol',
  name: 'Carol Chen',
  handle: null,
  optedOut: false,
}
const dan: TaggablePerson = {
  speakerId: 'spk-dan',
  name: 'Dan Ødegaard',
  handle: 'dan.example.com',
  optedOut: false,
}

const BODY =
  '🎙️ @alice.dev, Bob Smith, Olga Nordmann and Carol Chen on running Kubernetes at the edge. Catch them at Cloud Native Bergen 2027!'

const danUnresolved: MentionRecord = {
  _key: 'spk-dan',
  handle: 'dan.example.com',
  speakerId: 'spk-dan',
  name: 'Dan Ødegaard',
  status: 'unresolved',
}

const optedOutIssue: TagIssue = {
  code: 'opted-out',
  mentionKey: 'spk-olga',
  handle: 'olga.dev',
  name: 'Olga Nordmann',
  message:
    'Olga Nordmann has asked not to be tagged in social posts. Use the plain name instead of @olga.dev.',
}
const tooLong: TagIssue = {
  code: 'plain-too-long',
  mentionKey: null,
  handle: null,
  name: null,
  message:
    'A tag may be swapped back for the name at publish, and then the post can reach 312 characters; Bluesky allows 300. Shorten it until it fits with or without each tag.',
}

/** The panel with the body it edits, as the editor wires it. */
function Harness({
  initialBody,
  people,
  mentions = [],
  initialIssues = [],
  lookups = {},
  pending = null,
}: {
  initialBody: string
  people: TaggablePerson[]
  mentions?: MentionRecord[]
  initialIssues?: TagIssue[]
  lookups?: Record<string, TagLookup>
  pending?: string | null
}) {
  const [body, setBody] = useState(initialBody)
  const [issues, setIssues] = useState(initialIssues)
  return (
    <div className="max-w-xl space-y-3">
      <TagPanel
        body={body}
        people={people}
        mentions={mentions}
        issues={issues}
        pending={pending}
        lookups={lookups}
        onTag={(p) => setBody((b) => tagName(b, p) ?? b)}
        onUntag={(p, tag) => setBody((b) => untagOwned(b, tag, p.name))}
        onFix={(issue) => {
          setBody((b) => fixTagIssue(b, issue, people, mentions))
          setIssues((xs) => xs.filter((x) => x !== issue))
        }}
      />
      <p
        data-testid="body"
        className="rounded-md bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800 dark:bg-gray-800 dark:text-gray-100"
      >
        {body}
      </p>
    </div>
  )
}

const meta = {
  title: 'Systems/Marketing/Admin/TagPanel',
  component: Harness,
  args: { initialBody: BODY, people: [alice, bob, olga, carol] },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Bluesky tags in the Task editor: Tag swaps the name for the handle once Bluesky confirms it; Use name swaps it back. Opted-out speakers and people without a Bluesky link have no button. Issues from a refused save or approval offer "Use the plain name".',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <div className={dark ? 'dark' : ''}>
          <div className="min-h-screen bg-white p-4 sm:p-6 dark:bg-gray-950">
            <Story />
          </div>
        </div>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

/** Every button state: tagged, taggable, opted out, no Bluesky link. */
export const ButtonStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', {
        name: "Use Alice Anderson's name instead of the tag",
      }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Tag Bob Smith' }),
    ).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: /Olga/ })).toBeNull()
    await expect(canvas.getByText('Asked not to be tagged')).toBeVisible()
    await expect(
      canvas.getByText('No Bluesky link on their profile'),
    ).toBeVisible()
  },
}
export const ButtonStatesDark: Story = {
  parameters: { theme: 'dark' },
}
export const ButtonStatesMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Tag and back: the body swaps name ↔ handle. */
export const ToggleNameAndHandle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Tag Bob Smith' }))
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      '@alice.dev, @bob.bsky.social, Olga',
    )
    await userEvent.click(
      canvas.getByRole('button', {
        name: "Use Bob Smith's name instead of the tag",
      }),
    )
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      '@alice.dev, Bob Smith, Olga',
    )
  },
}

/** Checking a handle, one that did not resolve, and Bluesky down. */
export const LookupStates: Story = {
  args: {
    initialBody: 'Bob Smith and Dan Ødegaard and Alice Anderson',
    people: [bob, dan, alice],
    pending: 'spk-alice',
    lookups: { 'spk-bob': 'not-found', 'spk-dan': 'unreachable' },
  },
}

/** Generation wanted to tag Dan and his link did not resolve (§4.3). */
export const UnresolvedNote: Story = {
  args: {
    initialBody: 'Dan Ødegaard on eBPF at Cloud Native Bergen 2027.',
    people: [dan],
    mentions: [danUnresolved],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        "Dan Ødegaard's Bluesky link does not resolve",
      ),
    ).toBeVisible()
  },
}

/** A refused save: the one-click fix rewrites the body and clears the issue. */
export const IssueWithFix: Story = {
  args: {
    initialBody:
      'Meet @olga.dev and Alice Anderson at Cloud Native Bergen 2027.',
    people: [alice, olga],
    initialIssues: [optedOutIssue, tooLong],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('alert')).toHaveLength(2)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use the plain name' }),
    )
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      'Meet Olga Nordmann and Alice Anderson',
    )
    // The fixed issue is gone; the length issue (no one-click fix) stays.
    await expect(canvas.getAllByRole('alert')).toHaveLength(1)
    await expect(
      canvas.queryByRole('button', { name: 'Use the plain name' }),
    ).toBeNull()
  },
}
export const IssueWithFixDark: Story = {
  args: IssueWithFix.args,
  parameters: { theme: 'dark' },
}
export const IssueWithFixMobile: Story = {
  args: IssueWithFix.args,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/**
 * A speaker erased or deleted since the post was tagged (#1232): their record
 * reads as the neutral words, so the issue and its fix name nobody, and their
 * unresolved note is not shown.
 */
const goneTag: MentionRecord = {
  _key: 'spk-gone',
  handle: 'grace.dev',
  did: 'did:plc:grace',
  speakerId: 'spk-gone',
  name: GONE_SPEAKER_TEXT,
  status: 'tagged',
}
const goneNote: MentionRecord = {
  _key: 'spk-gone2',
  handle: 'gone2.dev',
  speakerId: 'spk-gone2',
  name: GONE_SPEAKER_TEXT,
  status: 'unresolved',
}
const goneBody =
  'Meet @grace.dev and Alice Anderson at Cloud Native Bergen 2027.'
export const GoneSpeakerIssue: Story = {
  args: {
    initialBody: goneBody,
    people: [alice],
    mentions: [goneTag, goneNote],
    initialIssues: approvalCheck({
      body: goneBody,
      mentions: [goneTag],
      people: [alice],
      resolutions: new Map(),
    }).issues,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      '@grace.dev tags someone who is no longer a speaker at this conference.',
    )
    await expect(canvas.queryByText(/Bluesky link does not resolve/)).toBeNull()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use “a speaker”' }),
    )
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      'Meet a speaker and Alice Anderson',
    )
  },
}
export const GoneSpeakerIssueDark: Story = {
  args: GoneSpeakerIssue.args,
  parameters: { theme: 'dark' },
}
export const GoneSpeakerIssueMobile: Story = {
  args: GoneSpeakerIssue.args,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/**
 * Alice changed her Bluesky link after the post was tagged: the body still
 * carries her recorded old handle, and "Use name" swaps THAT one back.
 */
export const TaggedByAnOlderHandle: Story = {
  args: {
    initialBody: 'Catch @alice.dev at 10.',
    people: [{ ...alice, handle: 'alice.example.com' }],
    mentions: [
      {
        _key: 'spk-alice',
        handle: 'alice.dev',
        did: 'did:plc:alice',
        speakerId: 'spk-alice',
        name: 'Alice Anderson',
        status: 'tagged',
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: "Use Alice Anderson's name instead of the tag",
      }),
    )
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      'Catch Alice Anderson at 10.',
    )
  },
}

/**
 * Dan's note came from an old handle; tagging him by his current one clears
 * it at once, not only after the next save.
 */
export const UnresolvedNoteClearsOnceTagged: Story = {
  args: {
    initialBody: 'Dan Ødegaard on eBPF.',
    people: [{ ...dan, handle: 'dan.new.example' }],
    mentions: [danUnresolved],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText("Dan Ødegaard's Bluesky link does not resolve"),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Tag Dan Ødegaard' }),
    )
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      '@dan.new.example on eBPF.',
    )
    await expect(
      canvas.queryByText("Dan Ødegaard's Bluesky link does not resolve"),
    ).toBeNull()
  },
}

/**
 * Two speakers share a team account. Tagging Bob swaps HIS name and marks
 * only him tagged; Alice keeps her own Tag button.
 */
export const SharedTeamHandle: Story = {
  args: {
    initialBody: 'Bob Smith and Alice Anderson on platform teams.',
    people: [
      { ...bob, handle: 'team.dev' },
      { ...alice, handle: 'team.dev' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Tag Bob Smith' }))
    await expect(canvas.getByTestId('body')).toHaveTextContent(
      '@team.dev and Alice Anderson on platform teams.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Tag Alice Anderson' }),
    ).toBeEnabled()
    await expect(
      canvas.queryByRole('button', {
        name: "Use Alice Anderson's name instead of the tag",
      }),
    ).toBeNull()
  },
}
