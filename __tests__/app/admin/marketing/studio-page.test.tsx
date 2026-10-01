/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

const orgIdMock = vi.hoisted(() => ({ value: 'org-1' as string | null }))
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({}) }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
  resolveCurrentOrgId: async () => orgIdMock.value,
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
  MemeGeneratorWithDownload: ({
    orgId,
    projectId,
  }: {
    orgId?: string
    projectId?: string
  }) => (
    <div
      data-testid="meme-generator"
      data-org={orgId ?? 'none'}
      data-project={projectId ?? 'none'}
    />
  ),
}))
vi.mock('@/components/admin/StudioPhotoGallery', () => ({
  StudioPhotoGallery: () => null,
}))
vi.mock(
  '@/components/common/DownloadableImage',
  () => import('../../../mocks/downloadable-image'),
)
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
    ['task', 'speaker', 'sponsor', 'format'].flatMap((param) => [
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
  it('opens the saved video the URL names, on the meme generator tab (#1181)', async () => {
    render(
      await MarketingPage({
        searchParams: Promise.resolve({ project: 'vp-1', speaker: 'sp-1' }),
      }),
    )
    const generator = screen.getByTestId('meme-generator')
    expect(generator.getAttribute('data-project')).toBe('vp-1')
    expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
      'meme-generator',
    )
  })

  it('drops a project id that is not a published document id', async () => {
    render(
      await MarketingPage({
        searchParams: Promise.resolve({ project: 'drafts.vp-1' }),
      }),
    )
    expect(
      screen.getByTestId('meme-generator').getAttribute('data-project'),
    ).toBe('none')
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
    [
      {
        tab: 'speakers',
        speakerId: 'grace',
        sponsorId: null,
        project: null,
        format: 'square',
      },
      'Grace',
      'Ada',
    ],
    [
      {
        tab: 'sponsors',
        speakerId: null,
        sponsorId: 'other',
        project: null,
        format: 'square',
      },
      'Other',
      'Acme',
    ],
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

  it('Open in studio on an exported video reopens its project (#1182)', async () => {
    const query = Object.fromEntries(
      new URL(
        openInStudioHref({
          tab: 'meme-generator',
          speakerId: null,
          sponsorId: null,
          project: { _id: 'vp-1', exists: true },
          format: 'square',
        }),
        'https://x',
      ).searchParams,
    )
    render(await MarketingPage({ searchParams: Promise.resolve(query) }))
    expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
      'meme-generator',
    )
    expect(
      screen.getByTestId('meme-generator').getAttribute('data-project'),
    ).toBe('vp-1')
  })

  it.each(['meme-generator', 'conference', 'photo-gallery'] as const)(
    'Open in studio lands on the %s tab',
    async (tab) => {
      const query = Object.fromEntries(
        new URL(
          openInStudioHref({
            tab,
            speakerId: null,
            sponsorId: null,
            project: null,
            format: 'square',
          }),
          'https://x',
        ).searchParams,
      )
      render(await MarketingPage({ searchParams: Promise.resolve(query) }))
      expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(tab)
    },
  )
})

describe('Promo Studio Formats (#1247)', () => {
  it('has one Format switch above the promo, the speaker grid and the sponsor grid, each starting square', async () => {
    render(
      await MarketingPage({
        searchParams: Promise.resolve({ task: 'render-1', speaker: 'ada' }),
      }),
    )
    const groups = screen.getAllByRole('radiogroup', { name: 'Format' })
    // Three: the promo (#1250), the speakers and the sponsors. The meme
    // generator and the photo collage keep their shapes.
    expect(groups).toHaveLength(3)
    for (const [group, label] of [
      [groups[1], 'speakers'],
      [groups[2], 'sponsors'],
    ] as const) {
      const tab = group.parentElement!.parentElement!
      const grid = within(tab).getByRole('region', { name: `All ${label}` })
      expect(
        group.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(
        within(group)
          .getAllByRole('radio')
          .map((radio) => [
            radio.textContent,
            radio.getAttribute('aria-checked'),
          ]),
      ).toEqual([
        ['Square1080×1080', 'true'],
        ['Landscape1200×628', 'false'],
        ['Portrait1080×1350', 'false'],
      ])
    }
    // The pinned card is inside its tab's switch too: it changes with the grid.
    const speakersTab = groups[1].parentElement!.parentElement!
    expect(
      within(speakersTab).getByRole('region', { name: 'Card for your Task' }),
    ).toBeTruthy()
  })

  it('puts the promo under its own switch, starting square, with every element (#1250)', async () => {
    render(await MarketingPage({ searchParams: Promise.resolve({}) }))
    const [group] = screen.getAllByRole('radiogroup', { name: 'Format' })
    const tab = group.parentElement!.parentElement!
    const promo = tab.querySelector<HTMLElement>('[data-card="promo"]')!
    expect(promo.dataset.format).toBe('square')
    expect(
      group.compareDocumentPosition(promo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // No other card shares the promo's switch.
    expect(tab.querySelectorAll('[data-card]')).toHaveLength(1)
    const text = (name: string) =>
      promo.querySelector(`[data-card-element="${name}"]`)?.textContent
    expect(text('title')).toBe('Test Conference')
    // No start date: the line is left out, never invented.
    expect(text('date')).toBeUndefined()
    expect(text('place')).toBe('Location TBA')
    expect(text('counts')).toBe('2Speakers2Talks0Workshops')
    expect(text('description')).toBe(
      'Join 2 confirmed speakers at Test Conference for a day of talks, hands-on workshops and meaningful connections.',
    )
    expect(
      promo.querySelector('[data-card-element="qr"] img')?.getAttribute('src'),
    ).toBe('data:image/png;base64,AA==')
    // Its gallery card is the conference tab's, with no subject.
    const card = promo.closest<HTMLElement>('[data-testid="card"]')!
    expect(JSON.parse(card.getAttribute('data-studio')!)).toEqual({
      tab: 'conference',
      title: 'Test Conference promo',
    })
  })

  it('reopens a promo gallery entry on its tab in its Format (#1250)', async () => {
    const query = Object.fromEntries(
      new URL(
        openInStudioHref({
          tab: 'conference',
          speakerId: null,
          sponsorId: null,
          project: null,
          format: 'portrait',
        }),
        'https://x',
      ).searchParams,
    )
    render(await MarketingPage({ searchParams: Promise.resolve(query) }))
    expect(screen.getByTestId('tabs').getAttribute('data-tab')).toBe(
      'conference',
    )
    const promo = document.querySelector<HTMLElement>('[data-card="promo"]')!
    expect(promo.dataset.format).toBe('portrait')
  })

  it('opens every switch on the Format a gallery entry names, and ignores one it does not know', async () => {
    const checked = () =>
      screen.getAllByRole('radiogroup', { name: 'Format' }).map((group) =>
        within(group)
          .getAllByRole('radio')
          .find((radio) => radio.getAttribute('aria-checked') === 'true')!
          .textContent?.replace(/\d+×\d+$/, ''),
      )
    const query = Object.fromEntries(
      new URL(
        openInStudioHref({
          tab: 'sponsors',
          speakerId: null,
          sponsorId: 'acme',
          project: null,
          format: 'landscape',
        }),
        'https://x',
      ).searchParams,
    )
    render(await MarketingPage({ searchParams: Promise.resolve(query) }))
    expect(checked()).toEqual(['Landscape', 'Landscape', 'Landscape'])
    cleanup()
    render(
      await MarketingPage({
        searchParams: Promise.resolve({ format: 'story' }),
      }),
    )
    expect(checked()).toEqual(['Square', 'Square', 'Square'])
  })
})

describe('Promo Studio without a resolvable organization', () => {
  afterEach(() => {
    orgIdMock.value = 'org-1'
  })

  it('refuses to render rather than naming uploads with an empty id', async () => {
    orgIdMock.value = null
    render(await MarketingPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Error loading the organization')).toBeTruthy()
    expect(screen.queryByTestId('gallery-context')).toBeNull()
  })
})
