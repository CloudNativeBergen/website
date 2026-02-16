export type SearchCategory =
  | 'pages'
  | 'proposals'
  | 'speakers'
  | 'sponsors'
  | 'orders'
  | 'workshops'
  | 'volunteers'

export interface SearchResultItem {
  id: string
  title: string
  subtitle?: string
  description?: string
  category: SearchCategory
  url: string
  metadata?: Record<string, unknown>
  icon?: React.ComponentType<{ className?: string }>
}

export interface SearchResultGroup {
  category: SearchCategory
  label: string
  items: SearchResultItem[]
  totalCount?: number
}

export interface SearchResults {
  groups: SearchResultGroup[]
  totalCount: number
}

export interface SearchProviderResult {
  category: SearchCategory
  label: string
  items: SearchResultItem[]
  totalCount?: number
  error?: string
}

export interface SearchProvider {
  readonly category: SearchCategory
  readonly label: string
  readonly priority: number
  search(query: string): Promise<SearchProviderResult>
}
