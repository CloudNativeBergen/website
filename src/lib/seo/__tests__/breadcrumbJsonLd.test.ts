import { buildBreadcrumbJsonLd } from '../breadcrumbJsonLd'

describe('buildBreadcrumbJsonLd', () => {
  it('builds a BreadcrumbList with 1-based positions and absolute URLs', () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://cloudnativebergen.dev' },
      { name: 'Speakers', url: 'https://cloudnativebergen.dev/speaker' },
      {
        name: 'Jane Doe',
        url: 'https://cloudnativebergen.dev/speaker/jane-doe',
      },
    ])

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://cloudnativebergen.dev',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Speakers',
          item: 'https://cloudnativebergen.dev/speaker',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Jane Doe',
          item: 'https://cloudnativebergen.dev/speaker/jane-doe',
        },
      ],
    })
  })

  it('assigns sequential positions in input order', () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://example.com' },
      { name: 'Program', url: 'https://example.com/program' },
    ])
    const items = jsonLd.itemListElement as Array<{ position: number }>
    expect(items.map((i) => i.position)).toEqual([1, 2])
  })

  it('returns an empty itemListElement for no crumbs', () => {
    const jsonLd = buildBreadcrumbJsonLd([])
    expect(jsonLd.itemListElement).toEqual([])
  })
})
