import { AdminPagesSearchProvider } from '@/lib/search/providers/AdminPagesSearchProvider'

describe('AdminPagesSearchProvider', () => {
  const provider = new AdminPagesSearchProvider()

  it('has correct category and priority', () => {
    expect(provider.category).toBe('pages')
    expect(provider.label).toBe('Pages')
    expect(provider.priority).toBe(1)
  })

  it('returns empty items for empty query', async () => {
    const result = await provider.search('')
    expect(result.items).toEqual([])
    expect(result.category).toBe('pages')
  })

  it('returns empty items for whitespace-only query', async () => {
    const result = await provider.search('   ')
    expect(result.items).toEqual([])
  })

  it('matches pages by title', async () => {
    const result = await provider.search('Dashboard')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((i) => i.title === 'Dashboard')).toBe(true)
  })

  it('matches pages by keyword', async () => {
    const result = await provider.search('cfp')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((i) => i.title === 'Proposals')).toBe(true)
  })

  it('is case-insensitive', async () => {
    const result = await provider.search('SETTINGS')
    expect(result.items.some((i) => i.title === 'Settings')).toBe(true)
  })

  it('returns items with correct structure', async () => {
    const result = await provider.search('dashboard')
    const item = result.items[0]
    expect(item).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      category: 'pages',
      url: expect.stringContaining('/admin'),
    })
    expect(item.icon).toBeDefined()
  })

  it('returns no results for non-matching query', async () => {
    const result = await provider.search('xyznonexistent')
    expect(result.items).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('matches partial keywords', async () => {
    const result = await provider.search('spon')
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    expect(result.items.some((i) => i.title === 'Sponsors')).toBe(true)
  })

  it('includes totalCount in results', async () => {
    const result = await provider.search('ticket')
    expect(result.totalCount).toBe(result.items.length)
  })
})
