import { BuildingOfficeIcon } from '@heroicons/react/24/outline'
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'
import type { Sponsor } from '@/lib/sponsor/types'

export class SponsorsSearchProvider implements SearchProvider {
  readonly category = 'sponsors' as const
  readonly label = 'Sponsors'
  readonly priority = 3

  constructor(
    private searchFn: (query: string) => Promise<Sponsor[]>,
  ) {}

  async search(query: string): Promise<SearchProviderResult> {
    const normalizedQuery = query.trim()

    if (!normalizedQuery) {
      return {
        category: this.category,
        label: this.label,
        items: [],
      }
    }

    try {
      const sponsors = await this.searchFn(normalizedQuery)

      const items: SearchResultItem[] = sponsors.map((sponsor) => ({
        id: sponsor._id,
        title: sponsor.name,
        subtitle: sponsor.url || undefined,
        category: this.category,
        url: '/admin/sponsors',
        metadata: {
          sponsor,
        },
        icon: BuildingOfficeIcon,
      }))

      return {
        category: this.category,
        label: this.label,
        items,
        totalCount: items.length,
      }
    } catch (error) {
      console.error('Sponsors search error:', error)
      return {
        category: this.category,
        label: this.label,
        items: [],
        error: 'Failed to search sponsors',
      }
    }
  }
}
