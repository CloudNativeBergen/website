import { UserGroupIcon } from '@heroicons/react/24/outline'
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'
import type { Speaker } from '@/lib/speaker/types'

export class SpeakersSearchProvider implements SearchProvider {
  readonly category = 'speakers' as const
  readonly label = 'Speakers'
  readonly priority = 4

  constructor(private searchFn: (query: string) => Promise<Speaker[]>) {}

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
      const speakers = await this.searchFn(normalizedQuery)

      const items: SearchResultItem[] = speakers.map((speaker) => ({
        id: speaker._id,
        title: speaker.name,
        subtitle: speaker.title || speaker.email || undefined,
        category: this.category,
        url: '/admin/speakers', // Note: navigates to speakers list where users can filter
        metadata: {
          speaker,
        },
        icon: UserGroupIcon,
      }))

      return {
        category: this.category,
        label: this.label,
        items,
        totalCount: items.length,
      }
    } catch (error) {
      console.error('Speakers search error:', error)
      return {
        category: this.category,
        label: this.label,
        items: [],
        error: 'Failed to search speakers',
      }
    }
  }
}
