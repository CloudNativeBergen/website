/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PreviewBandFrame } from './PreviewBandFrame'
import type {
  KnownSectionContentStatus,
  SectionContentStatus,
} from '@/lib/homepage/contentStatus'

afterEach(cleanup)

/** A component that throws on render, standing in for a section with a bug. */
function Exploding(): never {
  throw new Error('boom')
}

function status(
  overrides: Partial<KnownSectionContentStatus> = {},
): SectionContentStatus {
  return {
    type: 'homepageFeaturedSpeakers',
    kind: 'empty-hides',
    willHide: true,
    count: 0,
    countLabel: 'speakers',
    summary: 'No speakers yet',
    reason: 'Hidden on the live site — no featured speakers are selected.',
    source: {
      id: 'featured-speakers',
      label: 'Featured speakers',
      href: '/admin/marketing/featured',
      manageLabel: 'Choose speakers',
    },
    manage: { label: 'Choose speakers', href: '/admin/marketing/featured' },
    ...overrides,
    // Last, and not overridable: this fixture is always a KNOWN section type,
    // and spreading `Partial<…>` over the discriminant would widen it to
    // `true | undefined` and break the narrowing the union exists for.
    known: true,
  }
}

describe('PreviewBandFrame — error isolation', () => {
  it('replaces only the failed band; siblings keep rendering', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <>
        <PreviewBandFrame sectionKey="a" label="Hero" mode="design">
          <p>Hero content</p>
        </PreviewBandFrame>
        <PreviewBandFrame
          sectionKey="b"
          label="Featured Speakers"
          mode="design"
        >
          <Exploding />
        </PreviewBandFrame>
        <PreviewBandFrame sectionKey="c" label="Sponsors" mode="design">
          <p>Sponsor content</p>
        </PreviewBandFrame>
      </>,
    )

    // The failed band names itself, so the organizer knows WHICH one broke.
    expect(screen.getByText('Featured Speakers failed to render')).toBeTruthy()
    expect(screen.getByText('Hero content')).toBeTruthy()
    expect(screen.getByText('Sponsor content')).toBeTruthy()
    errorSpy.mockRestore()
  })

  it('heals when the next state push bumps resetKey', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(
      <PreviewBandFrame
        sectionKey="b"
        label="Rich Text"
        mode="design"
        resetKey={0}
      >
        <Exploding />
      </PreviewBandFrame>,
    )
    expect(screen.getByText('Rich Text failed to render')).toBeTruthy()

    rerender(
      <PreviewBandFrame
        sectionKey="b"
        label="Rich Text"
        mode="design"
        resetKey={1}
      >
        <p>Fixed copy</p>
      </PreviewBandFrame>,
    )

    expect(screen.queryByText(/failed to render/i)).toBeNull()
    expect(screen.getByText('Fixed copy')).toBeTruthy()
    errorSpy.mockRestore()
  })

  it('stays failed while the state has not changed', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(
      <PreviewBandFrame sectionKey="b" label="FAQ" mode="design" resetKey={3}>
        <Exploding />
      </PreviewBandFrame>,
    )
    // A re-render for an unrelated reason (hover) must not retry the throw —
    // that would loop the boundary on every pointer move.
    rerender(
      <PreviewBandFrame
        sectionKey="b"
        label="FAQ"
        mode="design"
        resetKey={3}
        hovered
      >
        <Exploding />
      </PreviewBandFrame>,
    )
    expect(screen.getByText('FAQ failed to render')).toBeTruthy()
    errorSpy.mockRestore()
  })
})

describe('PreviewBandFrame — Design mode marks, Live mode does not', () => {
  it('chips a sample-backed band and links where to add the real thing', () => {
    render(
      <PreviewBandFrame
        sectionKey="a"
        label="Featured Speakers"
        mode="design"
        sample
        status={status({ kind: 'empty-hides' })}
      >
        <p>Sample speakers</p>
      </PreviewBandFrame>,
    )
    expect(screen.getByText(/Sample content/)).toBeTruthy()
    const link = screen.getByText('Choose speakers').closest('a')
    expect(link?.getAttribute('href')).toBe('/admin/marketing/featured')
  })

  it('chips a hidden band and ghosts it rather than removing it', () => {
    const { container } = render(
      <PreviewBandFrame sectionKey="a" label="Sponsors" mode="design" hidden>
        <p>Sponsor content</p>
      </PreviewBandFrame>,
    )
    expect(screen.getByText('Hidden')).toBeTruthy()
    // Still rendered — ghosting is the point; absence is what today's editor did.
    expect(screen.getByText('Sponsor content')).toBeTruthy()
    expect(container.querySelector('.opacity-40')).not.toBeNull()
  })

  it('plates a band that renders nothing, quoting the renderer’s own reason', () => {
    render(
      <PreviewBandFrame
        sectionKey="a"
        label="Photo Gallery"
        mode="design"
        emptyInPreview
        status={status({
          reason: 'Hidden on the live site — there are no featured photos.',
        })}
      >
        <p>never rendered</p>
      </PreviewBandFrame>,
    )
    expect(
      screen.getByText('Photo Gallery — not shown on the live site'),
    ).toBeTruthy()
    expect(screen.getByText(/no featured photos/)).toBeTruthy()
    expect(screen.queryByText('never rendered')).toBeNull()
  })

  it('flags a degraded band without hiding its content', () => {
    render(
      <PreviewBandFrame
        sectionKey="a"
        label="Sponsors"
        mode="design"
        status={status({
          type: 'homepageSponsors',
          kind: 'degraded',
          willHide: false,
          summary: 'No sponsors — CTA only',
        })}
      >
        <p>Become a sponsor</p>
      </PreviewBandFrame>,
    )
    expect(screen.getByText(/No sponsors — CTA only/)).toBeTruthy()
    expect(screen.getByText('Become a sponsor')).toBeTruthy()
  })

  it('adds no chrome at all in Live mode', () => {
    const { container } = render(
      <PreviewBandFrame
        sectionKey="a"
        label="Featured Speakers"
        mode="live"
        sample
        hidden
        status={status()}
      >
        <p>Live content</p>
      </PreviewBandFrame>,
    )
    expect(screen.queryByText(/Sample content/)).toBeNull()
    expect(screen.queryByText('Hidden')).toBeNull()
    expect(container.querySelector('.opacity-40')).toBeNull()
    expect(screen.getByText('Live content')).toBeTruthy()
  })
})

describe('PreviewBandFrame — locate', () => {
  it('reports selection and hover by stable _key', () => {
    const onSelect = vi.fn()
    const onHover = vi.fn()
    const { container } = render(
      <PreviewBandFrame
        sectionKey="speakers-1"
        label="Featured Speakers"
        mode="design"
        onSelect={onSelect}
        onHover={onHover}
      >
        <p>content</p>
      </PreviewBandFrame>,
    )
    const band = container.querySelector('[data-preview-band="speakers-1"]')!
    fireEvent.click(band)
    expect(onSelect).toHaveBeenCalledWith('speakers-1')
    fireEvent.mouseEnter(band)
    expect(onHover).toHaveBeenCalledWith('speakers-1')
    fireEvent.mouseLeave(band)
    expect(onHover).toHaveBeenCalledWith(null)
  })

  it('outlines the focused band without taking layout space', () => {
    const { container } = render(
      <PreviewBandFrame sectionKey="a" label="Hero" mode="live" focused>
        <p>content</p>
      </PreviewBandFrame>,
    )
    const band = container.querySelector('[data-preview-band="a"]')!
    // `outline`, never `border`/`ring` with offset: a band must measure the
    // same in the preview as it does on the live site.
    expect(band.className).toContain('outline-2')
    expect(band.className).not.toContain('border-2')
  })
})
