import { buildPersonJsonLd, type PersonSpeaker } from '../personJsonLd'

function makeSpeaker(overrides: Partial<PersonSpeaker> = {}): PersonSpeaker {
  return {
    name: 'Jane Doe',
    title: 'Principal Engineer',
    image: 'https://cdn.sanity.io/images/jane.jpg',
    links: [
      'https://twitter.com/janedoe',
      'https://www.linkedin.com/in/janedoe',
    ],
    ...overrides,
  }
}

describe('buildPersonJsonLd', () => {
  it('builds a full Person node with every known field', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: makeSpeaker(),
      url: 'https://cloudnativebergen.dev/speaker/jane-doe',
    })

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Jane Doe',
      jobTitle: 'Principal Engineer',
      image: 'https://cdn.sanity.io/images/jane.jpg',
      url: 'https://cloudnativebergen.dev/speaker/jane-doe',
      sameAs: [
        'https://twitter.com/janedoe',
        'https://www.linkedin.com/in/janedoe',
      ],
    })
  })

  it('prefers a pre-resolved image URL over the raw speaker image', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: makeSpeaker({ image: 'image-abc123-500x500-png' }),
      image: 'https://cdn.sanity.io/images/resolved.jpg',
    })
    expect(jsonLd.image).toBe('https://cdn.sanity.io/images/resolved.jpg')
  })

  it('omits sameAs when the speaker has no social links', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: makeSpeaker({ links: [] }),
    })
    expect(jsonLd).not.toHaveProperty('sameAs')
  })

  it('omits sameAs when links is undefined', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: makeSpeaker({ links: undefined }),
    })
    expect(jsonLd).not.toHaveProperty('sameAs')
  })

  it('omits optional fields entirely rather than emitting undefined', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: { name: 'No Frills' },
    })

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'No Frills',
    })
    // No undefined values leak into the emitted object.
    expect(Object.values(jsonLd)).not.toContain(undefined)
  })

  it('omits jobTitle when title is missing', () => {
    const jsonLd = buildPersonJsonLd({
      speaker: makeSpeaker({ title: undefined }),
    })
    expect(jsonLd).not.toHaveProperty('jobTitle')
  })

  it('omits url when not provided', () => {
    const jsonLd = buildPersonJsonLd({ speaker: makeSpeaker() })
    expect(jsonLd).not.toHaveProperty('url')
  })
})
