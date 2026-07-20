import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import {
  BrandingEditor,
  BrandingPreviewGrid,
  type BrandingValues,
} from './BrandingEditor'
import { NotificationProvider } from './NotificationProvider'

// Sample logos. The "dark" variants use light fills so they read on a dark
// background; the "bright" variants use dark fills for light backgrounds.
const LOGO_DARKFILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" width="200" height="48"><rect x="0" y="8" width="32" height="32" rx="6" fill="#1e40af"/><text x="44" y="33" font-family="sans-serif" font-size="22" font-weight="700" fill="#111827">CloudNative</text></svg>`
const LOGO_LIGHTFILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" width="200" height="48"><rect x="0" y="8" width="32" height="32" rx="6" fill="#60a5fa"/><text x="44" y="33" font-family="sans-serif" font-size="22" font-weight="700" fill="#ffffff">CloudNative</text></svg>`
const MARK_DARKFILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#1e40af"/><path d="M14 26 l7 8 l13 -16" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const MARK_LIGHTFILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="20" fill="#60a5fa"/><path d="M14 26 l7 8 l13 -16" stroke="#111827" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const POPULATED: BrandingValues = {
  logoBright: LOGO_DARKFILL,
  logoDark: LOGO_LIGHTFILL,
  logomarkBright: MARK_DARKFILL,
  logomarkDark: MARK_LIGHTFILL,
}

const EMPTY: BrandingValues = {}

const ok = (data: unknown) => () => HttpResponse.json({ result: { data } })

const handlers = [
  http.post(
    '/api/trpc/conference.updateBrandingLogo',
    ok({ success: true, updated: {} }),
  ),
  http.post(
    '/api/trpc/conference.sanitizeSvgPreview',
    ok({
      ok: true,
      svg: LOGO_DARKFILL,
      removed: ['<script> element'],
      sizeBytes: LOGO_DARKFILL.length,
      error: null,
    }),
  ),
]

const meta = {
  title: 'Systems/Settings/Admin/BrandingEditor',
  component: BrandingEditor,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-3 — the Branding logos editor. The conference stores four inlineSvg logo slots as raw SVG strings; this island uploads/replaces/removes them. An uploaded `.svg` is read to text, dry-run sanitized via `conference.sanitizeSvgPreview` (showing exactly what will be stored and what was stripped), then persisted per-slot via `conference.updateBrandingLogo`. The server re-sanitizes on write.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof BrandingEditor>

export default meta
type Story = StoryObj<typeof meta>

/** The read-only card body wrapper the settings page renders. */
function Card({ values }: { values: BrandingValues }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
        Branding
      </h3>
      <BrandingPreviewGrid values={values} />
    </div>
  )
}

/** Card body with all four slots populated (light theme). */
export const CardPopulated: Story = {
  args: { initialValues: POPULATED },
  render: () => <Card values={POPULATED} />,
}

export const CardPopulatedDark: Story = {
  ...CardPopulated,
  parameters: { theme: 'dark' },
}

/** Card body with every slot empty — falls back to defaults on the site. */
export const CardEmpty: Story = {
  args: { initialValues: EMPTY },
  render: () => <Card values={EMPTY} />,
}

/** The upload modal, opened, with all slots populated. */
export const ModalPopulated: Story = {
  args: { initialValues: POPULATED, defaultOpen: true },
}

export const ModalPopulatedDark: Story = {
  ...ModalPopulated,
  parameters: { theme: 'dark' },
}

/** The upload modal, opened, with every slot empty. */
export const ModalEmpty: Story = {
  args: { initialValues: EMPTY, defaultOpen: true },
}

/**
 * A freshly-uploaded logo whose sanitized preview stripped disallowed content —
 * the amber warning tells the organizer exactly what was removed before save.
 */
export const ModalStrippedWarning: Story = {
  args: {
    initialValues: { logoDark: LOGO_LIGHTFILL },
    defaultOpen: true,
    defaultDrafts: {
      logoBright: {
        svg: LOGO_DARKFILL,
        removed: ['<script> element', 'onclick event handler'],
      },
    },
  },
}

export const ModalStrippedWarningDark: Story = {
  ...ModalStrippedWarning,
  parameters: { theme: 'dark' },
}

/**
 * Interaction test: uploading a `.svg` reads it to text, dry-run sanitizes it
 * via `conference.sanitizeSvgPreview` (mocked to strip a `<script>`), then shows
 * the sanitized preview AND the "removed" warning — all before any save.
 */
export const UploadFlow: Story = {
  args: { initialValues: EMPTY, defaultOpen: true },
  play: async () => {
    const input = screen.getByLabelText<HTMLInputElement>(
      'Upload Logo — Light Mode',
    )
    const file = new File(
      [
        `<svg xmlns="http://www.w3.org/2000/svg"><script>x</script><rect/></svg>`,
      ],
      'logo.svg',
      { type: 'image/svg+xml' },
    )
    await userEvent.upload(input, file)

    // The dry-run preview's "removed" note surfaces the stripped <script>.
    await waitFor(() =>
      expect(screen.getByText(/removed:/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/<script> element/)).toBeInTheDocument()

    // Save is now enabled (a valid, sanitized draft exists).
    const save = screen.getByRole('button', { name: /save logos/i })
    expect(save).toBeEnabled()
  },
}
