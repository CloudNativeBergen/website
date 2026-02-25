import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { adminSearchProposals } from '@/lib/proposal'
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'
import { isWorkshopFormat, statuses } from '@/lib/proposal/types'

export class ProposalsSearchProvider implements SearchProvider {
  readonly category = 'proposals' as const
  readonly label = 'Proposals'
  readonly priority = 2

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
      const response = await adminSearchProposals(normalizedQuery)

      if (response.error) {
        return {
          category: this.category,
          label: this.label,
          items: [],
          error: response.error.message,
        }
      }

      const proposals = response.proposals || []
      const items: SearchResultItem[] = proposals.map((proposal) => {
        const speakers =
          proposal.speakers && Array.isArray(proposal.speakers)
            ? proposal.speakers.filter(
                (speaker) =>
                  typeof speaker === 'object' && speaker && 'name' in speaker,
              )
            : []

        const speakerNames = speakers.map((s) => s.name).join(', ')
        const isWorkshop = isWorkshopFormat(proposal.format)
        const statusLabel = statuses.get(proposal.status) || proposal.status

        return {
          id: proposal._id,
          title: proposal.title,
          subtitle: speakerNames || 'Unknown Speaker',
          description: statusLabel,
          category: this.category,
          url: `/admin/proposals/${proposal._id}`,
          metadata: {
            status: proposal.status,
            speakers: proposal.speakers,
            isWorkshop,
          },
          icon: DocumentTextIcon,
        }
      })

      return {
        category: this.category,
        label: this.label,
        items,
        totalCount: items.length,
      }
    } catch (error) {
      console.error('Proposals search error:', error)
      return {
        category: this.category,
        label: this.label,
        items: [],
        error: 'Failed to search proposals',
      }
    }
  }
}
