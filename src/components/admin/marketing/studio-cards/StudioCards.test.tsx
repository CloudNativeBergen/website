/** @vitest-environment jsdom */
/**
 * Every element survives in every Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md
 * §3), asserted on the rendered DOM, never on props; and one Format switch
 * changes every card on its tab (§4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { STUDIO_FORMAT_IDS, type StudioFormat } from '@/lib/marketing-asset'
import {
  FormatSwitch,
  SPEAKER_CARD_ELEMENTS,
  SPONSOR_CARD_ELEMENTS,
  SpeakerCard,
  SponsorCard,
  type SpeakerCardSpeaker,
} from '.'

vi.mock('@/components/CloudNativePattern', () => ({
  CloudNativePattern: () => <div data-testid="pattern" />,
}))
vi.mock('@/lib/sanity/client', () => ({
  speakerImageUrl: () => 'https://cdn.example.org/ada.jpg',
}))

afterEach(cleanup)

const QR = 'data:image/png;base64,AA=='

const ADA: SpeakerCardSpeaker = {
  name: 'Ada Lovelace',
  title: 'Analytical Engineer',
  image: 'image-ada',
  talks: [
    {
      title: 'Notes on the Analytical Engine',
      format: 'presentation_45',
    },
  ],
}

const ACME = {
  _id: 'acme',
  name: 'Acme',
  logo: '<svg viewBox="0 0 10 4"><text>ACME</text></svg>',
}
const GOLD = { title: 'Gold', tierType: 'standard' as const }

function element(card: HTMLElement, name: string): HTMLElement {
  const found = card.querySelector<HTMLElement>(`[data-card-element="${name}"]`)
  if (!found) throw new Error(`no ${name} on the ${card.dataset.format} card`)
  return found
}

describe('SpeakerCard', () => {
  it.each(STUDIO_FORMAT_IDS)(
    'keeps header, event, photo, name, talk and QR in %s',
    (format) => {
      render(
        <SpeakerCard
          speaker={ADA}
          qrCodeUrl={QR}
          variant="speaker-spotlight"
          isFeatured
          eventName="Cloud Native Days"
          showCloudNativePattern
          format={format}
        />,
      )
      const card = screen
        .getByText('Ada Lovelace')
        .closest<HTMLElement>('[data-card="speaker"]')!
      expect(card.dataset.format).toBe(format)
      // The Format's own layout branch rendered, not another's.
      expect(card.querySelectorAll('[data-layout]')).toHaveLength(1)
      expect(
        card.querySelector<HTMLElement>('[data-layout]')!.dataset.layout,
      ).toBe(format)
      expect(card.style.aspectRatio).toBe(
        {
          square: '1080 / 1080',
          landscape: '1200 / 628',
          portrait: '1080 / 1350',
        }[format],
      )
      // Each element once: the reflow moves it, never duplicates or drops it.
      for (const name of SPEAKER_CARD_ELEMENTS) {
        expect(
          card.querySelectorAll(`[data-card-element="${name}"]`),
        ).toHaveLength(1)
      }
      expect(element(card, 'header').textContent).toBe('Featured Speaker')
      expect(element(card, 'event').textContent).toBe('Cloud Native Days')
      expect(element(card, 'name').textContent).toBe('Ada Lovelace')
      expect(element(card, 'talk').textContent).toContain(
        'Notes on the Analytical Engine',
      )
      expect(
        within(element(card, 'photo'))
          .getByRole('img', { name: 'Ada Lovelace' })
          .getAttribute('src'),
      ).toBe('https://cdn.example.org/ada.jpg')
      expect(
        within(element(card, 'qr')).getByRole('img').getAttribute('src'),
      ).toBe(QR)
      // The brand pattern fills the frame in every Format.
      expect(within(card).getByTestId('pattern')).toBeTruthy()
    },
  )

  it('shows initials where there is no photo, so the photo slot never empties', () => {
    render(
      <SpeakerCard
        speaker={{ ...ADA, image: undefined }}
        qrCodeUrl={QR}
        eventName="CND"
        format="landscape"
      />,
    )
    const card = screen
      .getByText('Ada Lovelace')
      .closest<HTMLElement>('[data-card="speaker"]')!
    expect(element(card, 'photo').textContent).toBe('AL')
  })
})

describe('SponsorCard', () => {
  it.each(STUDIO_FORMAT_IDS)(
    'keeps header, event line, logo, tier, tagline and QR in %s',
    (format) => {
      render(
        <SponsorCard
          sponsor={ACME}
          tier={GOLD}
          qrCodeUrl={QR}
          variant="cloud-wizards"
          eventName="Cloud Native Days"
          eventDate="10 June 2026"
          showCloudNativePattern
          format={format}
        />,
      )
      const card = screen
        .getByText('Cloud Wizards')
        .closest<HTMLElement>('[data-card="sponsor"]')!
      expect(card.dataset.format).toBe(format)
      expect(
        card.querySelector<HTMLElement>('[data-layout]')!.dataset.layout,
      ).toBe(format)
      for (const name of SPONSOR_CARD_ELEMENTS) {
        expect(
          card.querySelectorAll(`[data-card-element="${name}"]`),
        ).toHaveLength(1)
      }
      expect(element(card, 'header').textContent).toBe('Cloud Wizards')
      expect(element(card, 'event').textContent).toBe(
        'Cloud Native Days10 June 2026',
      )
      expect(element(card, 'logo').querySelector('svg')).not.toBeNull()
      expect(element(card, 'tier').textContent).toBe('Gold Sponsor')
      expect(element(card, 'tagline').textContent).toBe(
        'Casting spells in the cloud and making distributed systems magic happen',
      )
      expect(
        within(element(card, 'qr')).getByRole('img').getAttribute('src'),
      ).toBe(QR)
      expect(within(card).getByTestId('pattern')).toBeTruthy()
    },
  )

  it('prints the name where there is no logo, so the logo slot never empties', () => {
    render(
      <SponsorCard
        sponsor={{ _id: 'noname', name: 'Nordic Labs' }}
        tier={GOLD}
        qrCodeUrl={QR}
        eventName="Cloud Native Days"
        format="portrait"
      />,
    )
    const card = screen
      .getByText('Gold Sponsor')
      .closest<HTMLElement>('[data-card="sponsor"]')!
    expect(element(card, 'logo').textContent).toBe('Nordic Labs')
  })
})

describe('FormatSwitch', () => {
  function formats(): StudioFormat[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('[data-card]'),
    ).map((card) => card.dataset.format as StudioFormat)
  }

  it('starts square and changes every card on the tab at once', () => {
    render(
      <FormatSwitch>
        <SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />
        <SpeakerCard
          speaker={{ ...ADA, name: 'Grace Hopper' }}
          qrCodeUrl={QR}
          eventName="CND"
        />
        <SponsorCard
          sponsor={ACME}
          tier={GOLD}
          qrCodeUrl={QR}
          eventName="CND"
        />
      </FormatSwitch>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Format' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((radio) => radio.textContent)).toEqual([
      'Square1080×1080',
      'Landscape1200×628',
      'Portrait1080×1350',
    ])
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(formats()).toEqual(['square', 'square', 'square'])

    fireEvent.click(within(group).getByRole('radio', { name: /Landscape/ }))
    expect(formats()).toEqual(['landscape', 'landscape', 'landscape'])
    expect(
      within(group)
        .getByRole('radio', { name: /Landscape/ })
        .getAttribute('aria-checked'),
    ).toBe('true')

    fireEvent.click(within(group).getByRole('radio', { name: /Portrait/ }))
    expect(formats()).toEqual(['portrait', 'portrait', 'portrait'])
  })

  it('moves the choice with the arrow keys and keeps one tab stop', () => {
    render(
      <FormatSwitch>
        <SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />
      </FormatSwitch>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Format' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(formats()).toEqual(['landscape'])
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(formats()).toEqual(['portrait'])
    expect(document.activeElement).toBe(radios[2])
  })

  it('follows a new URL Format without undoing a choice made on the tab', () => {
    // The studio stays mounted when "Open in studio" navigates from one gallery
    // card to another: the page re-renders with a new ?format= and the switch
    // must follow it (Greptile on #1251), while a same-URL re-render keeps the
    // organizer's own choice.
    const { rerender } = render(
      <FormatSwitch defaultFormat="square">
        <SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />
      </FormatSwitch>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Format' })
    fireEvent.click(within(group).getByRole('radio', { name: /Landscape/ }))
    expect(formats()).toEqual(['landscape'])

    rerender(
      <FormatSwitch defaultFormat="square">
        <SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />
      </FormatSwitch>,
    )
    expect(formats()).toEqual(['landscape'])

    rerender(
      <FormatSwitch defaultFormat="portrait">
        <SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />
      </FormatSwitch>,
    )
    expect(formats()).toEqual(['portrait'])
    expect(
      within(group)
        .getByRole('radio', { name: /Portrait/ })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('is square outside any switch, as every card was before Formats', () => {
    render(<SpeakerCard speaker={ADA} qrCodeUrl={QR} eventName="CND" />)
    expect(formats()).toEqual(['square'])
  })
})
