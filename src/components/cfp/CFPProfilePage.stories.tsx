import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { http, HttpResponse } from 'msw'
import type { Decorator } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { CFPProfilePage } from './CFPProfilePage'
import { Speaker, Flags } from '@/lib/speaker/types'
import { ProfileEmail } from '@/lib/profile/types'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

// The speaker profile page. On mount it fires `speaker.getCurrent` (seeded from
// the `initialSpeaker` prop), `speaker.getEmails`, and the push settings card's
// `push.getVapidKey` / `push.getPreferences` — all mocked at the tRPC HTTP
// boundary via MSW. `push.getVapidKey` returns an EMPTY key on purpose so the
// push card renders its "not configured" state without touching the browser
// push/subscription APIs in Storybook.

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })

const filledSpeaker = {
  _id: 'speaker-1',
  _rev: 'rev1',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@gmail.com',
  slug: 'alice-johnson',
  title: 'Senior Platform Engineer at Google Cloud',
  bio: 'Alice is a passionate advocate for cloud native technologies with over 10 years of experience in distributed systems and Kubernetes.',
  image: 'https://placehold.co/200x200/EEE/31343C?text=AJ',
  flags: [Flags.localSpeaker],
  gender: 'Woman',
  country: 'Norway',
  links: [
    'https://linkedin.com/in/alicejohnson',
    'https://github.com/alicejohnson',
  ],
  providers: ['github:123', 'linkedin:456'],
  consent: {
    dataProcessing: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
    marketing: { granted: false },
    publicProfile: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
    photography: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
  },
} as unknown as Speaker

const emptySpeaker = {
  _id: 'speaker-2',
  _rev: 'rev1',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  name: 'New Speaker',
  email: 'new@example.com',
  slug: 'new-speaker',
  providers: ['github:789'],
} as unknown as Speaker

const mockEmails: ProfileEmail[] = [
  {
    email: 'alice@gmail.com',
    primary: true,
    verified: true,
    visibility: 'public',
  },
  {
    email: 'alice.work@company.io',
    primary: false,
    verified: true,
    visibility: 'private',
  },
]

const queryHandlersFor = (speaker: Speaker) => [
  http.get('/api/trpc/:proc', ({ params }) => {
    switch (params.proc) {
      case 'speaker.getCurrent':
        return trpc(speaker)
      case 'speaker.getEmails':
        return trpc(mockEmails)
      case 'push.getVapidKey':
        // Empty publicKey → push card renders its "not configured" state.
        return trpc({ publicKey: '' })
      case 'push.getPreferences':
        return trpc(DEFAULT_PUSH_PREFERENCES)
      default:
        return trpc(null)
    }
  }),
]

const mutationHandlers = [
  http.post('/api/trpc/speaker.update', () => trpc(filledSpeaker)),
  http.post('/api/trpc/speaker.setMessagingEmailDefault', () =>
    trpc({ success: true }),
  ),
]

const handlersFor = (speaker: Speaker) => [
  ...queryHandlersFor(speaker),
  ...mutationHandlers,
]

// A component (not just the decorator closure) so the `useEffect` that mirrors
// `.dark` onto `<html>` — needed for portaled push-permission UI — satisfies
// the rules-of-hooks lint. Mirrors the `withPortalTheme` helper.
function ThemeFrame({
  dark,
  children,
}: {
  dark: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <div className={dark ? 'dark' : ''}>
      <div className={dark ? 'bg-gray-950 p-4' : 'bg-white p-4'}>
        {children}
      </div>
    </div>
  )
}

const withTheme: Decorator = (Story, ctx) => (
  <ThemeFrame dark={!!ctx.parameters.dark}>
    <Story />
  </ThemeFrame>
)

const meta = {
  title: 'Systems/CFP/CFPProfilePage',
  component: CFPProfilePage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlersFor(filledSpeaker) },
    docs: {
      description: {
        component:
          'The speaker profile page: identity/email, linked providers, the speaker details form, message-email default, and push settings. Stories cover the filled and near-empty profiles, the provider-link result banners, and a successful save. tRPC is mocked via MSW.',
      },
    },
  },
  args: {
    initialSpeaker: filledSpeaker,
    currentProvider: 'github',
  },
  decorators: [withTheme],
} satisfies Meta<typeof CFPProfilePage>

export default meta
type Story = StoryObj<typeof meta>

/** A complete profile: bio, image, links, two linked providers. */
export const Filled: Story = {}

export const FilledDark: Story = {
  parameters: { dark: true, msw: { handlers: handlersFor(filledSpeaker) } },
}

/** A freshly created profile: name/email only, one linked provider. */
export const Empty: Story = {
  args: { initialSpeaker: emptySpeaker },
  parameters: { msw: { handlers: handlersFor(emptySpeaker) } },
}

/** Returned from a successful provider link (`?linkResult=linked`). */
export const LinkedSuccess: Story = {
  args: { linkResult: 'linked' },
}

/** The linked account already belongs to another profile (amber notice). */
export const AlreadyLinked: Story = {
  args: { linkResult: 'already-linked' },
}

/** The link attempt failed (red notice). */
export const LinkError: Story = {
  args: { linkResult: 'error' },
}

/** Saving the profile surfaces the green "Profile updated" confirmation. */
export const SaveSuccess: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: /update profile/i }),
    )
    await canvas.findByText(/profile updated successfully/i)
  },
}
