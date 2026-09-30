import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import type { SpeakerWithTalks } from '@/lib/speaker/types'
import { captureImage } from '@/components/common/image-capture'
import { STUDIO_FORMATS, type StudioFormat } from '@/lib/marketing-asset'
import {
  FormatSwitch,
  SPEAKER_CARD_ELEMENTS,
  SPONSOR_CARD_ELEMENTS,
  SpeakerCard,
  SponsorCard,
} from '.'

/**
 * Every template in every Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md §3):
 * one story per pair, so the capture can be checked against the story. Each
 * story's play proves the six elements are on the card and inside its frame,
 * and that a real capture comes out at exactly the Format's pixels.
 */

const QR =
  "data:image/svg+xml,%3csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='120' height='120' fill='white'/%3e%3cpath d='M10,10 L20,10 L20,20 L10,20 Z M30,10 L40,10 L40,20 L30,20 Z M50,10 L60,10 L60,20 L50,20 Z M70,10 L80,10 L80,20 L70,20 Z M10,30 L20,30 L20,40 L10,40 Z M50,30 L60,30 L60,40 L50,40 Z M70,30 L80,30 L80,40 L70,40 Z M10,50 L20,50 L20,60 L10,60 Z M30,50 L40,50 L40,60 L30,60 Z M50,50 L60,50 L60,60 L50,60 Z M70,50 L80,50 L80,60 L70,60 Z M30,70 L40,70 L40,80 L30,80 Z M50,70 L60,70 L60,80 L50,80 Z' fill='black'/%3e%3c/svg%3e"

/** A portrait stand-in: no network, deterministic pixels. */
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6c177"/><stop offset="1" stop-color="#c4a1ff"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="150" r="80" fill="#3b2a4a"/><path d="M60 400 Q200 220 340 400 Z" fill="#3b2a4a"/></svg>`,
)}`

const ADA = {
  _id: 'ada',
  name: 'Ada Lovelace',
  slug: 'ada-lovelace',
  title: 'Analytical Engineer, Babbage & Co',
  image: PHOTO,
  talks: [
    {
      _id: 'talk-1',
      title: 'Notes on the Analytical Engine: programming before computers',
      format: 'presentation_45',
    },
  ],
} as unknown as SpeakerWithTalks

const ACME = {
  _id: 'acme-corp',
  name: 'Acme Corporation',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect x="4" y="4" width="192" height="72" rx="12" fill="none" stroke="white" stroke-width="4"/><text x="100" y="54" font-family="sans-serif" font-size="40" font-weight="700" fill="white" text-anchor="middle">ACME</text></svg>',
}
const GOLD = {
  title: 'Gold',
  tagline: 'Premium sponsorship tier',
  tierType: 'standard' as const,
}

const ELEMENTS = {
  speaker: SPEAKER_CARD_ELEMENTS,
  sponsor: SPONSOR_CARD_ELEMENTS,
} as const

interface CardArgs {
  template: 'speaker' | 'sponsor'
  format: StudioFormat
  /** The card's CSS width; the capture is the Format's pixels regardless. */
  width: number
  /** Long names, titles and event names: what the clamps are for. */
  long?: boolean
}

const LONG_EVENT = 'Cloud Native Days Norway 2026, Bergen — Grieghallen'

function Card({ template, format, width, long = false }: CardArgs) {
  return (
    <div style={{ width }}>
      {template === 'speaker' ? (
        <SpeakerCard
          speaker={
            long
              ? {
                  ...ADA,
                  name: 'Augusta Ada King-Noel, Countess of Lovelace',
                  title:
                    'Principal Analytical Engineer and Head of Programme Verification, Babbage & Co',
                  talks: [
                    {
                      title:
                        'Notes on the Analytical Engine: how a nineteenth-century programme anticipated loops, conditionals and the software supply chain',
                      format: 'workshop_120',
                    },
                  ],
                }
              : ADA
          }
          qrCodeUrl={QR}
          variant="speaker-spotlight"
          isFeatured
          eventName={long ? LONG_EVENT : 'Cloud Native Days Norway'}
          showCloudNativePattern
          format={format}
        />
      ) : (
        <SponsorCard
          sponsor={
            long
              ? {
                  _id: 'nordic-labs',
                  name: 'Nordic Cloud Foundry Laboratories',
                }
              : ACME
          }
          tier={long ? { ...GOLD, title: 'Platinum Community Partner' } : GOLD}
          qrCodeUrl={QR}
          variant="cloud-wizards"
          eventName={long ? LONG_EVENT : 'Cloud Native Days Norway'}
          eventDate="June 10–11, 2026 · Bergen"
          showCloudNativePattern
          format={format}
        />
      )}
    </div>
  )
}

const meta = {
  title: 'Systems/Marketing/Studio Formats',
  component: Card,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The speaker card and the sponsor thank-you card in each of the three Formats (square 1080×1080, landscape 1200×628, portrait 1080×1350). Every element survives in every Format; only its place and size change.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
  args: { width: 540 },
} satisfies Meta<typeof Card>
export default meta

type Story = StoryObj<typeof meta>

/** Inside the frame, allowing a pixel of rounding. */
function inside(part: DOMRect, frame: DOMRect): boolean {
  return (
    part.left >= frame.left - 1 &&
    part.top >= frame.top - 1 &&
    part.right <= frame.right + 1 &&
    part.bottom <= frame.bottom + 1
  )
}

const provesEveryElementAndTheCapture: Story['play'] = async ({
  canvasElement,
  args,
}) => {
  const card = canvasElement.querySelector<HTMLElement>('[data-card]')
  await expect(card).not.toBeNull()
  await expect(card!.dataset.card).toBe(args.template)
  await expect(card!.dataset.format).toBe(args.format)
  const frame = card!.getBoundingClientRect()
  for (const name of ELEMENTS[args.template]) {
    const element = card!.querySelector<HTMLElement>(
      `[data-card-element="${name}"]`,
    )
    await expect(element, name).not.toBeNull()
    await expect(element!).toBeVisible()
    // Nothing is pushed out of the frame in any Format.
    await expect(inside(element!.getBoundingClientRect(), frame), name).toBe(
      true,
    )
  }
  // The real capture, at exactly the Format's pixels.
  const { width, height } = STUDIO_FORMATS[args.format]
  const blob = await captureImage(card!, { width, height })
  const bitmap = await createImageBitmap(blob)
  try {
    await expect([bitmap.width, bitmap.height]).toEqual([width, height])
  } finally {
    bitmap.close()
  }
}

export const SpeakerSquare: Story = {
  args: { template: 'speaker', format: 'square' },
  play: provesEveryElementAndTheCapture,
}
export const SpeakerLandscape: Story = {
  args: { template: 'speaker', format: 'landscape' },
  play: provesEveryElementAndTheCapture,
}
export const SpeakerPortrait: Story = {
  args: { template: 'speaker', format: 'portrait' },
  play: provesEveryElementAndTheCapture,
}
export const SponsorSquare: Story = {
  args: { template: 'sponsor', format: 'square' },
  play: provesEveryElementAndTheCapture,
}
export const SponsorLandscape: Story = {
  args: { template: 'sponsor', format: 'landscape' },
  play: provesEveryElementAndTheCapture,
}
export const SponsorPortrait: Story = {
  args: { template: 'sponsor', format: 'portrait' },
  play: provesEveryElementAndTheCapture,
}

/** Long text in the tightest Formats: every element still inside the frame. */
export const SpeakerLandscapeLongText: Story = {
  args: { template: 'speaker', format: 'landscape', long: true },
  play: provesEveryElementAndTheCapture,
}
export const SponsorSquareLongText: Story = {
  args: { template: 'sponsor', format: 'square', long: true },
  play: provesEveryElementAndTheCapture,
}
export const SponsorLandscapeLongText: Story = {
  args: { template: 'sponsor', format: 'landscape', long: true },
  play: provesEveryElementAndTheCapture,
}

/** The switch above a tab's grid (spec §4): every card on the tab follows it. */
export const SwitchOnATab: Story = {
  args: { template: 'speaker', format: 'square', width: 256 },
  render: () => (
    <FormatSwitch>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <div style={{ width: 256 }}>
          <SpeakerCard
            speaker={ADA}
            qrCodeUrl={QR}
            variant="speaker-spotlight"
            isFeatured
            eventName="Cloud Native Days Norway"
            showCloudNativePattern
          />
        </div>
        <div style={{ width: 256 }}>
          <SpeakerCard
            speaker={{ ...ADA, name: 'Grace Hopper', image: undefined }}
            qrCodeUrl={QR}
            variant="speaker-spotlight"
            eventName="Cloud Native Days Norway"
            showCloudNativePattern
          />
        </div>
        <div style={{ width: 256 }}>
          <SponsorCard
            sponsor={ACME}
            tier={GOLD}
            qrCodeUrl={QR}
            eventName="Cloud Native Days Norway"
            showCloudNativePattern
          />
        </div>
      </div>
    </FormatSwitch>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const formats = () =>
      Array.from(
        canvasElement.querySelectorAll<HTMLElement>('[data-card]'),
      ).map((card) => card.dataset.format)
    await expect(formats()).toEqual(['square', 'square', 'square'])
    await userEvent.click(canvas.getByRole('radio', { name: /Landscape/ }))
    await expect(formats()).toEqual(['landscape', 'landscape', 'landscape'])
    await userEvent.click(canvas.getByRole('radio', { name: /Portrait/ }))
    await expect(formats()).toEqual(['portrait', 'portrait', 'portrait'])
  },
}

/** The switch at phone width: no horizontal overflow, the sizes hidden. */
export const SwitchOnAPhone: Story = {
  args: { template: 'speaker', format: 'square', width: 256 },
  render: () => (
    <FormatSwitch>
      <div className="max-w-64">
        <SpeakerCard
          speaker={ADA}
          qrCodeUrl={QR}
          variant="speaker-spotlight"
          isFeatured
          eventName="Cloud Native Days Norway"
          showCloudNativePattern
        />
      </div>
    </FormatSwitch>
  ),
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole('radiogroup', {
      name: 'Format',
    })
    await expect(group.getBoundingClientRect().right).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )
  },
}
