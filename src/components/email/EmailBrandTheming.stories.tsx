import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ProposalAcceptTemplate } from './ProposalAcceptTemplate'
import { ProposalRejectTemplate } from './ProposalRejectTemplate'

/**
 * The visual proof for email brand theming: the SAME template, rendered with no
 * theme (what the live editions receive — must never change) and with a tenant
 * theme (what an external customer receives).
 *
 * Emails are inline-styled HTML with no dark mode, so these render on a fixed
 * light surface deliberately — that is genuinely what lands in the inbox.
 */
const meta = {
  title: 'Systems/Email/Brand Theming',
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const event = {
  eventName: 'Cloud Native Days Bergen',
  eventLocation: 'Bergen, Norway',
  eventDate: 'October 28, 2026',
  eventUrl: 'https://cloudnativebergen.dev',
  socialLinks: ['https://twitter.com/cnbergen', 'https://github.com/cnbergen'],
}

const proposal = {
  speakerName: 'Ada Lovelace',
  proposalTitle: 'Analytical Engines at Scale',
  comment: 'We loved the abstract — especially the section on determinism.',
  ...event,
}

/** A deep magenta: unmistakably not the house blue, and dark enough to need no clamping. */
const TENANT_BRAND = '#9D174D'
/** Sunflower yellow: white button text on it is 1.5:1, so the contrast clamp fires. */
const PALE_BRAND = '#FACC15'

function Pane({
  label,
  note,
  children,
}: {
  label: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 basis-[520px]">
      <div className="mb-2">
        <h3 className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
          {label}
        </h3>
        <p className="font-inter text-xs text-gray-600 dark:text-gray-400">
          {note}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

export const AcceptedProposal: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-8">
        <Pane
          label="Unthemed (house)"
          note="No theme stored — byte-identical to what shipped before theming."
        >
          <ProposalAcceptTemplate
            {...proposal}
            confirmUrl="https://example.com/confirm"
          />
        </Pane>
        <Pane
          label={`Themed (${TENANT_BRAND})`}
          note="Title, links, callout tint, section headers and the CTA all follow the tenant."
        >
          <ProposalAcceptTemplate
            {...proposal}
            confirmUrl="https://example.com/confirm"
            brandColor={TENANT_BRAND}
          />
        </Pane>
      </div>
    </div>
  ),
}

/** Status colours must survive theming; a rejection is red for every tenant. */
export const StatusColoursAreExempt: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-8">
        <Pane label="Unthemed (house)" note="Reject red, success green.">
          <ProposalRejectTemplate {...proposal} />
        </Pane>
        <Pane
          label={`Themed (${TENANT_BRAND})`}
          note="Brand chrome follows the tenant; the status red and green do not."
        >
          <ProposalRejectTemplate {...proposal} brandColor={TENANT_BRAND} />
        </Pane>
      </div>
    </div>
  ),
}

/** The CTA is white text on the brand fill; a pale brand is darkened, hue kept. */
export const ContrastClamp: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-8">
        <Pane
          label={`Pale brand (${PALE_BRAND})`}
          note="White-on-yellow is 1.5:1. The accent is darkened along the OKLab lightness axis until it clears 4.5:1 — still yellow, now readable."
        >
          <ProposalAcceptTemplate
            {...proposal}
            confirmUrl="https://example.com/confirm"
            brandColor={PALE_BRAND}
          />
        </Pane>
        <Pane
          label={`Dark brand (${TENANT_BRAND})`}
          note="Already 6.9:1 against white — returned verbatim, no clamping."
        >
          <ProposalAcceptTemplate
            {...proposal}
            confirmUrl="https://example.com/confirm"
            brandColor={TENANT_BRAND}
          />
        </Pane>
      </div>
    </div>
  ),
}
