import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { delay, http, HttpResponse } from 'msw'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'
import type { MintAllReport } from '@/lib/feedback/mint-all'
import { MintFeedbackCodesDialog } from './MintFeedbackCodesDialog'

const PREVIEW = '/api/trpc/sessionFeedback.mintPreview'
const MINT_ALL = '/api/trpc/sessionFeedback.mintAll'

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })

const report: MintAllReport = {
  minted: Array.from({ length: 39 }, (_, i) => ({
    talkId: `talk-${i}`,
    title: `Talk ${i}`,
    code: 'k7m2qx',
  })),
  alreadyHad: 2,
  skipped: [
    {
      talkId: 'talk-a',
      title: 'Platform engineering without the platform team',
      reason: 'release',
    },
    {
      talkId: 'talk-b',
      title: 'Lightning: eBPF in five minutes',
      reason: 'closed',
    },
  ],
  failed: [{ talkId: 'talk-c', title: 'Kubernetes: the hard parts' }],
}

/**
 * The dialog is portaled out of the story's root, past the global theme
 * decorator's `dark` wrapper; put `dark` on the document for it.
 */
function DocumentTheme({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return children
}

const meta = {
  title: 'Systems/Proposals/Session Feedback/MintFeedbackCodesDialog',
  component: MintFeedbackCodesDialog,
  parameters: {
    docs: {
      description: {
        component:
          'The Mint Feedback Codes action on `/admin/proposals` (#1459): counts the confirmed talks without a code (`sessionFeedback.mintPreview`), asks, mints them all (`sessionFeedback.mintAll`), and reports what it minted, skipped and failed. Dark mode: the global `theme` toolbar, applied to the document because the dialog is portaled.',
      },
    },
    msw: {
      handlers: [
        http.get(PREVIEW, () => trpc({ confirmed: 43, withoutCode: 41 })),
        http.post(MINT_ALL, () => trpc(report)),
      ],
    },
  },
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <Story />
      </DocumentTheme>
    ),
  ],
  args: { isOpen: true, onClose: fn() },
} satisfies Meta<typeof MintFeedbackCodesDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Confirm: Story = {
  play: async () => {
    expect(
      await screen.findByText(/41 of 43 confirmed talks have no Feedback Code/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mint 41 codes' })).toBeVisible()
  },
}

export const ConfirmDark: Story = { ...Confirm, globals: { theme: 'dark' } }

/** Mint, then the report: what was skipped and why, and what failed. */
export const Report: Story = {
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mint 41 codes' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Feedback Codes minted' }),
    ).toBeVisible()
    expect(
      screen.getByText('Minted 39 codes. 2 talks already had one.'),
    ).toBeVisible()
    expect(screen.getByText(/Waits in a scheduled release/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Kubernetes: the hard parts' }),
    ).toHaveAttribute('href', '/admin/proposals/talk-c')
    expect(
      screen.getByRole('button', { name: 'Try the failed again' }),
    ).toBeVisible()
  },
}

export const ReportDark: Story = { ...Report, globals: { theme: 'dark' } }

/** On a phone: the buttons stack and nothing pushes the page sideways. */
export const ReportMobile: Story = {
  ...Report,
  parameters: {
    ...Report.parameters,
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async (context) => {
    await Report.play!(context)
    const root = document.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}

export const EveryTalkHasACode: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(PREVIEW, () => trpc({ confirmed: 43, withoutCode: 0 })),
      ],
    },
  },
  play: async () => {
    expect(
      await screen.findByText(
        'All 43 confirmed talks already have a Feedback Code.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Mint/ })).toBeNull()
  },
}

/** While minting, the dialog cannot be closed; it would only hide the report. */
export const Minting: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(PREVIEW, () => trpc({ confirmed: 43, withoutCode: 41 })),
        http.post(MINT_ALL, async () => {
          await delay('infinite')
          return trpc(report)
        }),
      ],
    },
  },
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mint 41 codes' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Minting…' })).toBeDisabled(),
    )
    await userEvent.keyboard('{Escape}')
    expect(args.onClose).not.toHaveBeenCalled()
  },
}
