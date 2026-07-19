import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SpeakerMergeModal, type MergeCandidate } from './SpeakerMergeModal'
import { NotificationProvider } from './NotificationProvider'

// The REAL modal (not a mock shell): it is the house destructive-confirm modal
// — pick a survivor + duplicate, preview the exact reference/identity changes,
// then confirm through a second danger dialog. tRPC + NotificationProvider come
// from the global Storybook decorators / the wrapper below; the dry-run
// `speaker.admin.mergePreview` query is served by the msw handler.

const speakers: MergeCandidate[] = [
  { _id: 'spk-ada', name: 'Ada Lovelace', email: 'ada@example.com' },
  { _id: 'spk-ada-dup', name: 'Ada Lovelace', email: 'ada.l@work.io' },
  { _id: 'spk-grace', name: 'Grace Hopper', email: 'grace@example.com' },
  { _id: 'spk-noemail', name: 'Katherine Johnson', email: null },
]

// Shape mirrors `MergePreview` from '@/lib/speaker/merge' — the exact fields the
// modal renders (repoint counts by type, provider/email identity union, and the
// fields filled in from the duplicate).
const previewFixture = {
  survivorId: 'spk-ada',
  loserId: 'spk-ada-dup',
  referencingDocCount: 3,
  referenceRepointsByType: { talk: 2, review: 1 },
  fieldChanges: {
    providers: {
      before: ['github:1'],
      after: ['github:1', 'linkedin:2'],
    },
    knownEmails: {
      before: ['ada@example.com'],
      after: ['ada@example.com', 'ada.l@work.io'],
    },
    email: { before: 'ada@example.com', after: 'ada@example.com' },
    filledFromLoser: ['title', 'bio'],
  },
  willDeleteLoserId: 'spk-ada-dup',
}

// The global TRPCDecorator uses a non-batching httpLink, so each query is its
// own request answered with a single `{ result: { data } }` object (same shape
// SendMessageModal.stories relies on).
const handlers = [
  http.get('/api/trpc/speaker.admin.mergePreview', () =>
    HttpResponse.json({ result: { data: previewFixture } }),
  ),
]

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerMergeModal',
  component: SpeakerMergeModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Admin modal to fold a duplicate speaker into a canonical one: all references are repointed to the survivor and the duplicate is deleted. A dry-run preview (`speaker.admin.mergePreview`) spells out exactly what will change before a second danger dialog confirms the irreversible merge.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onMerged: fn(),
    speakers,
  },
  decorators: [
    (Story, context) => {
      // ModalShell renders through a Headless UI Dialog portal on `document.body`,
      // which escapes Storybook's theme-wrapper `<div class="dark">`. Mirror the
      // toolbar theme onto the document root so the portaled modal's `dark:`
      // classes resolve (in the app, next-themes puts the class there).
      const dark = context.globals.theme === 'dark'
      useEffect(() => {
        document.documentElement.classList.toggle('dark', dark)
        return () => document.documentElement.classList.remove('dark')
      }, [dark])
      return (
        <NotificationProvider>
          <Story />
        </NotificationProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SpeakerMergeModal>

export default meta
type Story = StoryObj<typeof meta>

/** Initial state: pick a survivor and a duplicate to merge. */
export const Default: Story = {}

/** Same modal at phone width — the selects stack and the arrow hides. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/**
 * Survivor + duplicate chosen and previewed: the change summary and the red
 * "Merge and delete duplicate" action are shown. The modal portals to the body,
 * so the play function queries the whole document.
 */
export const Previewed: Story = {
  play: async () => {
    const body = within(document.body)
    await userEvent.selectOptions(
      await body.findByRole('combobox', { name: /survivor/i }),
      'spk-ada',
    )
    await userEvent.selectOptions(
      await body.findByRole('combobox', { name: /duplicate/i }),
      'spk-ada-dup',
    )
    await userEvent.click(
      await body.findByRole('button', { name: /preview changes/i }),
    )
    await body.findByRole('button', { name: /merge and delete duplicate/i })
  },
}
