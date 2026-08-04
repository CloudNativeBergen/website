import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { RichTextBlock } from './RichTextBlock'
import type { RichTextContentBlock } from '@/lib/homepage/richText'

/**
 * Sanity's CDN is unreachable from Storybook (and the dataset needs a token),
 * so the image request is answered with a locally generated SVG. This keeps the
 * IMAGE stories about layout — figure width, caption, rhythm — instead of about
 * a broken-image icon.
 */
const placeholderImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#1D4ED8"/><rect x="40" y="40" width="1520" height="820" fill="none" stroke="#93c5fd" stroke-width="8"/><text x="800" y="480" font-family="sans-serif" font-size="80" fill="#dbeafe" text-anchor="middle">Grieghallen</text></svg>`

const sanityImageHandler = http.get('https://cdn.sanity.io/images/*', () =>
  HttpResponse.text(placeholderImage, {
    headers: { 'Content-Type': 'image/svg+xml' },
  }),
)

const IMAGE_REF = `image-${'a'.repeat(40)}-1600x900-jpg`

const block = (
  text: string,
  style: 'normal' | 'h2' | 'h3' = 'normal',
  key = text.slice(0, 8),
): RichTextContentBlock => ({
  _type: 'block',
  _key: key,
  style,
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}-s`, text, marks: [] }],
})

const sampleContent: RichTextContentBlock[] = [
  block('Why attend?', 'h2', 'why'),
  block(
    'Two days of deep, vendor-neutral cloud native content from the people building the platforms Norway runs on.',
    'normal',
    'intro',
  ),
]

/**
 * The realistic motivating case: a venue described as a Kubernetes manifest,
 * the way Cloud Native Days Vienna does it — prose, a code block, a definition
 * table, a callout and a captioned image, all from the allowlisted vocabulary.
 */
const venueAsManifest: RichTextContentBlock[] = [
  block(
    'Everything you need to know about the venue, declared the way we like it.',
    'normal',
    'lede',
  ),
  {
    _type: 'richTextCode',
    _key: 'yaml',
    language: 'yaml',
    filename: 'venue.yaml',
    code: `apiVersion: cloudnativedays.no/v1
kind: Venue
metadata:
  name: grieghallen
  labels:
    city: bergen
    accessible: "true"
spec:
  address: Edvard Griegs plass 1, 5015 Bergen
  capacity: 1500
  tracks:
    - name: platform-engineering
      room: peer-gynt
    - name: observability
      room: klokkeklang
  transit:
    - line: Bybanen
      stop: Nonneseteret
      walkMinutes: 4
status:
  phase: Ready`,
  },
  {
    _type: 'richTextCallout',
    _key: 'callout',
    tone: 'warning',
    title: 'Doors open at 08:00',
    body: 'Registration closes at 09:30 sharp on day one. Bring photo ID — the venue requires it for the upper floors.',
  },
  {
    _type: 'richTextTable',
    _key: 'rooms',
    headerRow: true,
    caption: 'Rooms and tracks',
    rows: [
      { _key: 'r0', cells: ['Room', 'Track', 'Capacity'] },
      { _key: 'r1', cells: ['Peer Gynt', 'Platform Engineering', '1500'] },
      { _key: 'r2', cells: ['Klokkeklang', 'Observability', '300'] },
      { _key: 'r3', cells: ['Foajeen', 'Sponsors & hallway track', '—'] },
    ],
  },
  {
    _type: 'richTextImage',
    _key: 'photo',
    asset: { _type: 'reference', _ref: IMAGE_REF },
    alt: 'Grieghallen seen from Edvard Griegs plass',
    caption: 'Grieghallen, home of the conference since 2023.',
  },
]

/**
 * The cases most likely to break the layout: a very long unbroken line of code,
 * a table wider than a phone, a link whose text is a long unbroken URL, and a
 * deeply nested list.
 */
const awkwardContent: RichTextContentBlock[] = [
  block('Awkward content', 'h2', 'awk'),
  {
    _type: 'richTextCode',
    _key: 'long',
    language: 'bash',
    filename: 'one-very-long-line.sh',
    code: `kubectl get pods --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\t"}{.status.phase}{"\\t"}{.spec.nodeName}{"\\n"}{end}' | sort | uniq -c | sort -rn | head -50
echo "short line"`,
  },
  {
    _type: 'block',
    _key: 'link',
    style: 'normal',
    markDefs: [
      {
        _type: 'link',
        _key: 'l1',
        href: 'https://cloudnativebergen.dev/schedule/2026/platform-engineering-track/day-one',
      },
    ],
    children: [
      {
        _type: 'span',
        _key: 'link-s',
        text: 'https://cloudnativebergen.dev/schedule/2026/platform-engineering-track/day-one',
        marks: ['l1'],
      },
    ],
  },
  {
    _type: 'richTextTable',
    _key: 'wide',
    headerRow: true,
    caption: 'A table wider than a phone — it scrolls inside its own box.',
    rows: [
      {
        _key: 'w0',
        cells: [
          'Time',
          'Peer Gynt',
          'Klokkeklang',
          'Foajeen',
          'Workshop room',
          'Streaming',
        ],
      },
      {
        _key: 'w1',
        cells: [
          '09:00',
          'Opening keynote',
          'Observability 101',
          'Sponsor booths',
          'Kubernetes from scratch',
          'Live',
        ],
      },
      {
        _key: 'w2',
        cells: [
          '10:30',
          'Platform teams that scale',
          'OpenTelemetry in anger',
          'Hallway track',
          'Cilium deep dive',
          'Recorded',
        ],
      },
    ],
  },
  {
    _type: 'block',
    _key: 'li1',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    markDefs: [],
    children: [
      { _type: 'span', _key: 'li1s', text: 'Top-level item', marks: [] },
    ],
  },
  {
    _type: 'block',
    _key: 'li2',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 'li2s',
        text: 'A nested item with a very long sentence that has to wrap gracefully on a narrow screen without pushing the page sideways.',
        marks: [],
      },
    ],
  },
]

const meta = {
  title: 'Systems/Homepage/Public/RichTextBlock',
  component: RichTextBlock,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [sanityImageHandler] },
    docs: {
      description: {
        component:
          'The homepage’s one CONSTRAINED escape hatch (front-page builder F2). The section registry stays closed — no raw HTML, no embeds — but this block carries an allowlisted rich-content vocabulary: prose, headings, lists, safe links, code/preformatted text, images from our own asset pipeline, small tables and callouts. Content is sanitised on the way in (Zod) and again on the way out (at render), so stored data written outside the mutation still cannot inject markup.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RichTextBlock>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    section: {
      _key: 'rt-1',
      _type: 'homepageRichText',
      heading: 'About the conference',
      content: sampleContent,
    },
  },
}

export const NoHeading: Story = {
  args: {
    section: {
      _key: 'rt-2',
      _type: 'homepageRichText',
      content: sampleContent,
    },
  },
}

/** The motivating case: the whole vocabulary, used the way a real event would. */
export const VenueAsManifest: Story = {
  args: {
    section: {
      _key: 'rt-3',
      _type: 'homepageRichText',
      heading: 'The venue, declaratively',
      content: venueAsManifest,
    },
  },
}

/** Long code lines, a wide table, a long link, nested lists. */
export const AwkwardContent: Story = {
  args: {
    section: {
      _key: 'rt-4',
      _type: 'homepageRichText',
      heading: 'Layout stress test',
      content: awkwardContent,
    },
  },
}

export const Dark: Story = {
  args: Default.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export const VenueAsManifestDark: Story = {
  args: VenueAsManifest.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export const AwkwardContentDark: Story = {
  args: AwkwardContent.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
