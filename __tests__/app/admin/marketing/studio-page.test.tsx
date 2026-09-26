/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({}) }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
  resolveCurrentOrgId: async () => 'org-1',
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conference-1',
      title: 'Test Conference',
      domains: ['example.com'],
      sponsors: ['Acme', 'Other'].map((name) => ({
        sponsor: { _id: name.toLowerCase(), slug: name.toLowerCase(), name },
        tier: { title: 'Gold', tierType: 'standard' },
      })),
    },
  }),
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposals: async () => ({
    proposals: ['Ada', 'Grace'].map((name) => ({
      _id: `talk-${name}`,
      title: `${name}'s talk`,
      status: 'confirmed',
      speakers: [{ _id: name.toLowerCase(), slug: name.toLowerCase(), name }],
    })),
  }),
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getFeaturedGalleryImages: async () => [],
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: async () => 'data:image/png;base64,AA==' },
}))
vi.mock('@/components/admin/marketing/StudioTaskProvider', () => ({
  StudioTaskProvider: ({
    taskId,
    children,
  }: {
    taskId?: string
    children: ReactNode
  }) => (
    <div data-testid="task-context" data-task={taskId ?? 'none'}>
      {children}
    </div>
  ),
}))
vi.mock('@/components/admin/MarketingTabs', () => ({
  MarketingTabs: ({
    defaultTab,
    children,
  }: {
    defaultTab: string
    children: ReactNode
  }) => (
    <div data-testid="tabs" data-tab={defaultTab}>
      {children}
    </div>
  ),
}))
vi.mock('@/components/admin', () => ({ AdminPageHeader: () => null }))
vi.mock('@/components/CloudNativePattern', () => ({
  CloudNativePattern: () => null,
}))
vi.mock('@/components/admin/meme-generator', () => ({
  MemeGeneratorWithDownload: ({ orgId }: { orgId?: string }) => (
    <div data-testid="meme-generator" data-org={orgId ?? 'none'} />
  ),
}))
vi.mock('@/components/admin/PhotoGalleryWithDownload', () => ({
  PhotoGalleryWithDownload: () => null,
}))
vi.mock('@/components/common/DownloadableImage', () => ({
  DownloadableImage: ({
    children,
    studio,
  }: {
    children: ReactNode
    studio?: unknown
  }) => (
    <div data-testid="card" data-studio={JSON.stringify(studio ?? null)}>
      {children}
    </div>
  ),
}))
vi.mock('@/components/admin/marketing/studio-gallery', () => ({
  StudioGalleryProvider: ({
    orgId,
    children,
  }: {
    orgId: string
    children: ReactNode
  }) => (
    <div data-testid="gallery-context" data-org={orgId}>
      {children}
    </div>
  ),
}))
vi.mock('@/components/SpeakerShare', () => ({
  SpeakerShare: ({ speaker }: { speaker: { name: string } }) => (
    <p>{speaker.name}</p>
  ),
}))
vi.mock('@/components/SponsorThankYou', () => ({
  SponsorThankYou: ({ sponsor }: { sponsor: { name: string } }) => (
    <p>{sponsor.name}</p>
  ),
}))

import MarketingPage from '@/app/(admin)/admin/marketing/studio/page'
import { openInStudioHref } from '@/lib/marketing-asset'

afterEach(cleanup)

describe('Promo Studio Task preselection', () => {
  it.each([
    ['speaker', 'ada', 'Ada', 'Grace', 'speakers'],
    ['sponsor', 'acme', 'Acme', 'Other', 'sponsors'],
  ])(
    'pins the selected %s above the unchanged full grid',
    async (param, id, selected, other, tab) => {
      render(
        await MarketingPage({
          searchParams: Promise.resolve({ task: 'render-1', [param]: id }),
        }),
      )
      expect(screen.queryAllByText(selected).length).toBe(2)
      expect(screen.queryAllByText(other).length).toBe(1)
      const pinned = screen.getByRole('region', { name: 'Card for your Task' })
      expect(within(pinned).getByText(selected).textContent).toBe(selected)
      const grid = screen.getByRole('region', { name: `All ${tab}` })
      expect(within(grid).getAllByText(selected).length).toBe(1)
      expect(within(grid).getByText(other).textContent).toBe(other)
      expect(
        pinned.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(tab)
    },
  )
})

describe('Promo Studio search parameter boundary', () => {
  it.each(
    ['task', 'speaker', 'sponsor'].flatMap((param) => [
      { param, kind: 'unsafe', value: '<script>alert(1)</script>' },
      { param, kind: 'repeated', value: ['ada', 'acme'] },
      { param, kind: 'oversized', value: 'a'.repeat(201) },
      { param, kind: 'draft', value: 'drafts.ada' },
    ]),
  )(
    'drops $kind $param before rendering while retaining valid preselection',
    async ({ param, value }) => {
      const selection = {
        task: 'render-1',
        ...(param === 'task' ? { speaker: 'ada' } : {}),
        [param]: value,
      }
      render(await MarketingPage({ searchParams: Promise.resolve(selection) }))
      expect(screen.getByTestId('task-context').getAttribute('data-task')).toBe(
        param === 'task' ? 'none' : 'render-1',
      )
      expect(screen.queryAllByText('Ada').length).toBe(param === 'task' ? 2 : 1)
      expect(screen.queryAllByText('Acme').length).toBe(1)
      expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
        param === 'task' ? 'speakers' : 'conference',
      )
    },
  )

  it('drops an invalid tab and uses the validated Task default', async () => {
    render(
      await MarketingPage({
        searchParams: Promise.resolve({ task: 'render-1', tab: '<script>' }),
      }),
    )
    expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
      'conference',
    )
  })
})

describe('Promo Studio meme generator', () => {
  it('is given the organization, so backgrounds can come from its gallery', async () => {
    render(await MarketingPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('meme-generator').getAttribute('data-org')).toBe(
      'org-1',
    )
  })
})

describe('Promo Studio Save to gallery (#1164)', () => {
  const studioOf = (card: HTMLElement) =>
    JSON.parse(card.getAttribute('data-studio') ?? 'null')

  it('offers the gallery with and without a Task, outside the Task context', async () => {
    for (const task of [undefined, 'render-1']) {
      render(
        await MarketingPage({
          searchParams: Promise.resolve(task ? { task } : {}),
        }),
      )
      const gallery = screen.getByTestId('gallery-context')
      expect(gallery.getAttribute('data-org')).toBe('org-1')
      expect(gallery.contains(screen.getByTestId('task-context'))).toBe(true)
      cleanup()
    }
  })

  it('gives every card its tab, and a speaker or sponsor card its subject and alt', async () => {
    render(await MarketingPage({ searchParams: Promise.resolve({}) }))
    const cards = screen.getAllByTestId('card').map(studioOf)
    expect(cards.map((card) => card.tab)).toEqual([
      'conference',
      'speakers',
      'speakers',
      'sponsors',
      'sponsors',
    ])
    expect(cards[0].subject).toBeUndefined()
    expect(cards[1]).toEqual({
      tab: 'speakers',
      title: 'Ada – speaker card',
      alt: "Speaker card for Ada, speaking on “Ada's talk” at Test Conference.",
      subject: { type: 'speaker', id: 'ada', name: 'Ada' },
    })
    expect(cards[3]).toEqual({
      tab: 'sponsors',
      title: 'Acme – thank-you card',
      alt: 'Thank-you card for Acme, Gold sponsor of Test Conference.',
      subject: { type: 'sponsor', id: 'acme', name: 'Acme' },
    })
  })

  it.each([
    [{ tab: 'speakers', speakerId: 'grace', sponsorId: null }, 'Grace', 'Ada'],
    [{ tab: 'sponsors', speakerId: null, sponsorId: 'other' }, 'Other', 'Acme'],
  ] as const)(
    'Open in studio lands on the tab and the card of %o',
    async (origin, selected, other) => {
      const query = Object.fromEntries(
        new URL(openInStudioHref(origin), 'https://x').searchParams,
      )
      render(await MarketingPage({ searchParams: Promise.resolve(query) }))
      expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
        origin.tab,
      )
      const pinned = screen.getByRole('region', { name: 'Selected card' })
      expect(within(pinned).getByText(selected).textContent).toBe(selected)
      expect(within(pinned).queryByText(other)).toBeNull()
      expect(screen.getByTestId('task-context').getAttribute('data-task')).toBe(
        'none',
      )
    },
  )

  it.each(['meme-generator', 'conference', 'photo-gallery'] as const)(
    'Open in studio lands on the %s tab',
    async (tab) => {
      const query = Object.fromEntries(
        new URL(
          openInStudioHref({ tab, speakerId: null, sponsorId: null }),
          'https://x',
        ).searchParams,
      )
      render(await MarketingPage({ searchParams: Promise.resolve(query) }))
      expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(tab)
    },
  )
})
