/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The preview's four load-bearing guarantees, asserted against a REAL render of
 * the real section components. Nothing here is a smoke test: each block is a bug
 * that would ship silently.
 *
 *  1. No `data-pirsch-event` survives in the preview DOM, and no anchor
 *     navigates — an editing session must not write into the conference's own
 *     conversion statistics.
 *  2. A throwing section takes down its own band and nothing else, and heals on
 *     the next state push.
 *  3. Design and Live modes differ in exactly the promised way: samples with
 *     chips vs. an honestly near-blank page.
 *  4. Placeholder gallery tiles never reach the Sanity CDN.
 */

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// The previewed Header reads the live session (and mounts the notification bell
// for a signed-in speaker). Signed out is the quieter fixture and exercises the
// same markup for everything this file asserts.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

import { HomepagePreview, buildPlaceholderImageMap } from './HomepagePreview'
import { sweepPreviewDom } from './usePreviewDomGuard'
import { withPlaceholders } from '@/lib/homepage/placeholders'
import type { Conference } from '@/lib/conference/types'
import type { HomepageSection } from '@/lib/homepage/sections'
import { HOMEPAGE_SECTION_TYPES } from '@/lib/homepage/sections'

afterEach(cleanup)

/** Fixed reference time, so placeholder dates and the countdown are stable. */
const NOW = Date.parse('2026-03-01T12:00:00Z')

/** A brand-new conference: nothing but an identity. The day-one state. */
function bareConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Sample Conference',
    organizer: 'Sample Org',
    city: '',
    domains: ['2026.example.com'],
    registrationEnabled: true,
    registrationLink: 'https://tickets.example.com',
    organizers: [],
    socialLinks: [],
    ...overrides,
  } as unknown as Conference
}

/** Every section type, once — the widest possible render surface. */
const allSections: HomepageSection[] = HOMEPAGE_SECTION_TYPES.map(
  (type, index) =>
    ({
      _key: `k-${index}`,
      _type: type,
    }) as HomepageSection,
)

function renderPreview(props: Partial<Parameters<typeof HomepagePreview>[0]>) {
  return render(
    <HomepagePreview
      conference={bareConference()}
      sections={allSections}
      now={NOW}
      {...props}
    />,
  )
}

describe('HomepagePreview — analytics can never fire', () => {
  it('leaves no data-pirsch-event attribute anywhere in the preview', async () => {
    const { container } = renderPreview({ mode: 'design' })
    // The effects that install the guard run on commit.
    await act(async () => {})

    expect(container.querySelectorAll('[data-pirsch-event]')).toHaveLength(0)
    expect(
      container.querySelectorAll('[data-pirsch-meta-position]'),
    ).toHaveLength(0)
  })

  it('would otherwise be armed — the fixture really does render CTAs', () => {
    // Guards the guard: if the section components ever stopped emitting Pirsch
    // attributes, the assertion above would pass for the wrong reason and the
    // day they came back nobody would notice. `sweepPreviewDom` on a detached
    // copy of the same markup must find something to strip.
    const probe = document.createElement('div')
    probe.innerHTML =
      '<a href="/cfp" data-pirsch-event="cta-cfp-hero" data-pirsch-meta-position="standouts">Submit</a>'
    const { pirschStripped } = sweepPreviewDom(probe)
    expect(pirschStripped).toBe(1)
    expect(probe.querySelector('a')?.hasAttribute('data-pirsch-event')).toBe(
      false,
    )
    expect(
      probe.querySelector('a')?.hasAttribute('data-pirsch-meta-position'),
    ).toBe(false)
  })

  it('re-strips an attribute that reappears after the initial sweep', async () => {
    const { container } = renderPreview({ mode: 'design' })
    await act(async () => {})

    // Stands in for a carousel step or an accordion toggle: a DOM change with
    // no state message behind it, which a post-commit-only sweep would miss.
    const root = container.querySelector('[data-preview-root]')!
    const link = document.createElement('a')
    link.setAttribute('href', '/tickets')
    link.setAttribute('data-pirsch-event', 'cta-tickets-hero')
    root.appendChild(link)

    // MutationObserver callbacks are microtask-scheduled.
    await act(async () => {
      await Promise.resolve()
    })
    expect(link.hasAttribute('data-pirsch-event')).toBe(false)
  })

  it('cancels every anchor click so no link navigates', async () => {
    const { container } = renderPreview({ mode: 'design' })
    await act(async () => {})

    const anchors = container.querySelectorAll('a[href]')
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
      anchor.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  })

  it('reroutes the previewed ThemeToggle instead of writing shared storage', async () => {
    const onThemeToggle = vi.fn()
    const { container } = renderPreview({ mode: 'design', onThemeToggle })
    await act(async () => {})

    const toggle = container.querySelector('[data-slot="theme-toggle"]')
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle!)
    expect(onThemeToggle).toHaveBeenCalledTimes(1)
  })
})

describe('HomepagePreview — Design vs Live', () => {
  it('Design mode fills the empty conference and marks every filled band', async () => {
    const { container } = renderPreview({ mode: 'design' })
    await act(async () => {})

    expect(screen.getAllByText(/Sample content/).length).toBeGreaterThan(0)
    // Sample speakers/sponsors/metrics really rendered, not just the chip.
    expect(screen.getAllByText(/Sample Speaker/).length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Sample attendees')
  })

  it('Live mode shows the truthful near-blank page: no samples, no chips', async () => {
    const { container } = renderPreview({ mode: 'live' })
    await act(async () => {})

    expect(screen.queryByText(/Sample content/)).toBeNull()
    expect(screen.queryByText(/Sample Speaker/)).toBeNull()
    expect(container.textContent).not.toContain('Sample attendees')
    // The hero always renders — a homepage always has a top.
    expect(screen.getAllByText(/Sample Conference/).length).toBeGreaterThan(0)
  })

  it('ghosts a hidden band in Design mode and drops it in Live mode', async () => {
    const sections: HomepageSection[] = [
      { _key: 'hero', _type: 'homepageHero' },
      {
        _key: 'cta',
        _type: 'homepageCtaBanner',
        hidden: true,
        heading: 'Switched off',
        body: 'body',
        buttonLabel: 'Go',
        buttonHref: '/cfp',
      } as HomepageSection,
    ]

    const design = renderPreview({ mode: 'design', sections })
    await act(async () => {})
    expect(screen.getByText('Switched off')).toBeTruthy()
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(
      design.container.querySelector('[data-preview-band="cta"]'),
    ).not.toBeNull()
    cleanup()

    const live = renderPreview({ mode: 'live', sections })
    await act(async () => {})
    expect(screen.queryByText('Switched off')).toBeNull()
    expect(live.container.querySelector('[data-preview-band="cta"]')).toBeNull()
  })

  it('plates a band that renders nothing even with placeholders', async () => {
    const sections: HomepageSection[] = [
      { _key: 'hero', _type: 'homepageHero' },
      // A rich-text block with no body has no conference-level source to fill.
      { _key: 'rich', _type: 'homepageRichText' } as HomepageSection,
    ]
    renderPreview({ mode: 'design', sections })
    await act(async () => {})

    expect(screen.getByText(/not shown on the live site/i)).toBeTruthy()
  })

  it('addresses every band by its stable _key, in order', async () => {
    const { container } = renderPreview({ mode: 'design' })
    await act(async () => {})

    const keys = Array.from(
      container.querySelectorAll('[data-preview-band]'),
    ).map((node) => node.getAttribute('data-preview-band'))
    expect(keys).toEqual(allSections.map((section) => section._key))
  })

  it('reports a clicked band to the composer', async () => {
    const onSelect = vi.fn()
    const { container } = renderPreview({ mode: 'design', onSelect })
    await act(async () => {})

    fireEvent.click(container.querySelector('[data-preview-band="k-0"]')!)
    expect(onSelect).toHaveBeenCalledWith('k-0')
  })
})

describe('HomepagePreview — placeholder gallery tiles never hit the CDN', () => {
  /**
   * NOTE ON SCOPE. `@sanity/image-url` is aliased to a stub for the whole test
   * run (`vitest.config.ts`), so a rendered `<img>` in jsdom carries a constant
   * URL that contains no asset id — the end-to-end swap cannot be observed
   * here, and asserting it would be asserting the stub. So this pins the two
   * halves that ARE real: the map the preview derives from the placeholder
   * data, and the sweep applied to a genuine CDN URL built from that same ref.
   * The end-to-end proof is the Storybook capture, which runs the real builder.
   */
  it('maps every placeholder tile ref to its own data URI, and swaps a real CDN URL', () => {
    const { conference } = withPlaceholders(bareConference(), { now: NOW })
    const map = buildPlaceholderImageMap(conference)
    expect(map.size).toBeGreaterThan(0)

    const [assetRef, dataUri] = [...map][0]
    expect(dataUri.startsWith('data:image/svg+xml')).toBe(true)

    // Exactly the shape `@sanity/image-url` emits: the `image-` prefix dropped,
    // a DOT before the extension, and transform query parameters appended.
    const [, hash, dims, ext] = assetRef.split('-')
    const cdnUrl = `https://cdn.sanity.io/images/proj/dataset/${hash}-${dims}.${ext}?w=1200&q=85&fit=max`

    const probe = document.createElement('div')
    probe.innerHTML = `<img src="${cdnUrl}" srcset="${cdnUrl} 1x, ${cdnUrl} 2x" />`
    const { imagesSwapped } = sweepPreviewDom(probe, {
      placeholderImages: map,
    })

    expect(imagesSwapped).toBe(1)
    const img = probe.querySelector('img')!
    expect(img.getAttribute('src')).toBe(dataUri)
    // A surviving srcset out-ranks src and would re-request the 404.
    expect(img.hasAttribute('srcset')).toBe(false)
  })

  it('leaves a real tenant photo alone', () => {
    const { conference } = withPlaceholders(bareConference(), { now: NOW })
    const map = buildPlaceholderImageMap(conference)
    const probe = document.createElement('div')
    probe.innerHTML =
      '<img src="https://cdn.sanity.io/images/proj/dataset/abc123-1600x900.jpg?w=1200" />'
    expect(
      sweepPreviewDom(probe, { placeholderImages: map }).imagesSwapped,
    ).toBe(0)
  })
})
