# Admin Search Architecture

This document describes the unified search system for the admin interface, which enables searching across multiple data types and admin pages from a single search modal (⌘K / Ctrl+K).

## Overview

The search system uses a provider-based architecture that makes it easy to add new search sources. Each provider is responsible for searching a specific data type and returns results in a standardized format.

## Architecture

### Core Types

Located in `src/lib/search/types.ts`:

- **`SearchCategory`**: Enum of searchable categories (pages, proposals, speakers, sponsors, etc.)
- **`SearchResultItem`**: Standardized result item with id, title, subtitle, description, category, url, and optional icon
- **`SearchResultGroup`**: Group of results from a single category
- **`SearchProvider`**: Interface that all providers must implement

### Search Providers

Located in `src/lib/search/providers/`:

1. **`AdminPagesSearchProvider`**
   - Priority: 1 (highest)
   - Searches: Static admin page list
   - Implementation: Client-side filtering
   - Use case: Quick navigation to admin pages

2. **`ProposalsSearchProvider`**
   - Priority: 2
   - Searches: Proposal titles, descriptions, speakers, topics
   - Implementation: Server-side via `adminSearchProposals()`
   - Use case: Finding talks and workshops

3. **`SponsorsSearchProvider`**
   - Priority: 3
   - Searches: Sponsor company names
   - Implementation: tRPC `sponsor.list({ query })` mutation
   - Use case: Finding sponsor organizations

4. **`SpeakersSearchProvider`**
   - Priority: 4
   - Searches: Speaker names, titles, emails, bios
   - Implementation: tRPC `speakers.search({ query })` mutation
   - Use case: Finding individual speakers

### Unified Search Hook

Located in `src/lib/search/hooks/useUnifiedSearch.ts`:

The `useUnifiedSearch` hook:

- Instantiates all search providers
- Executes searches in parallel across all providers
- Handles loading states and errors
- Groups and sorts results by priority
- Provides navigation functionality

### Search Modal Component

Located in `src/components/admin/SearchModal.tsx`:

The `SearchModal` component:

- Uses Headless UI's Combobox for keyboard navigation
- Implements 300ms debounce for search queries
- Displays results grouped by category with section headers
- Shows appropriate icons for each result type
- Maintains keyboard navigation across all result groups
- Supports dark mode

## Adding a New Search Provider

To add a new search source:

1. **Create the provider class** in `src/lib/search/providers/`:

```typescript
import type {
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../types'

export class MyNewSearchProvider implements SearchProvider {
  readonly category = 'myCategory' as const
  readonly label = 'My Category'
  readonly priority = 5 // Higher number = lower priority

  async search(query: string): Promise<SearchProviderResult> {
    if (!query.trim()) {
      return {
        category: this.category,
        label: this.label,
        items: [],
      }
    }

    try {
      // Your search implementation
      const results = await searchMyData(query)

      const items: SearchResultItem[] = results.map((result) => ({
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        category: this.category,
        url: `/admin/my-page/${result.id}`,
        icon: MyIcon,
      }))

      return {
        category: this.category,
        label: this.label,
        items,
        totalCount: items.length,
      }
    } catch (error) {
      console.error('My search error:', error)
      return {
        category: this.category,
        label: this.label,
        items: [],
        error: 'Failed to search my data',
      }
    }
  }
}
```

2. **Update the SearchCategory type** in `src/lib/search/types.ts`:

```typescript
export type SearchCategory =
  | 'pages'
  | 'proposals'
  | 'speakers'
  | 'sponsors'
  | 'myCategory' // Add your new category
// ...
```

3. **Register the provider** in `useUnifiedSearch` hook:

```typescript
const providers = useMemo<SearchProvider[]>(
  () => {
    return [
      new AdminPagesSearchProvider(),
      new ProposalsSearchProvider(),
      new SponsorsSearchProvider(/* ... */),
      new SpeakersSearchProvider(/* ... */),
      new MyNewSearchProvider(), // Add your provider
    ]
  },
  [
    /* dependencies */
  ],
)
```

4. **Export the provider** from `src/lib/search/providers/index.ts`:

```typescript
export { MyNewSearchProvider } from './MyNewSearchProvider'
```

## Search Implementation Patterns

### Server-Side Search (via API)

For data that requires complex database queries:

```typescript
const response = await fetch('/api/my-search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const data = await response.json()
```

### Server-Side Search (via tRPC)

For data with existing tRPC procedures:

```typescript
constructor(
  private searchFn: (query: string) => Promise<MyData[]>,
) {}

// In useUnifiedSearch:
new MySearchProvider(async (query) => {
  const result = await myTrpcMutation.mutateAsync({ query })
  return result
})
```

### Client-Side Search

For static data or small datasets already loaded:

```typescript
const items = STATIC_DATA.filter((item) =>
  item.title.toLowerCase().includes(query.toLowerCase()),
)
```

## Performance Considerations

- **Debouncing**: 300ms debounce prevents excessive API calls during typing
- **Parallel Queries**: All providers search simultaneously for fast results
- **Error Handling**: Individual provider errors don't break the entire search
- **Loading States**: Shows skeleton loader while searching
- **Result Limits**: Consider limiting results per category (e.g., top 5)

## Testing

The search modal includes Storybook stories in `SearchModal.stories.tsx`:

- **EmptyState**: Initial state before search
- **WithResults**: Example multi-category results
- **NoResults**: Empty results state
- **SearchError**: Error state

## Future Enhancements

Potential improvements to consider:

1. **Result Limits with "View All"**: Show top 3-5 per category with link to full list
2. **Recent Searches**: Remember and suggest recent queries
3. **Search Filters**: Allow filtering by category before searching
4. **Keyboard Shortcuts**: Add shortcuts for selecting specific categories
5. **Search Analytics**: Track popular searches to improve relevance
6. **Fuzzy Matching**: Implement fuzzy search for typo tolerance
7. **Search Highlighting**: Highlight matching terms in results

## Troubleshooting

### Provider not returning results

1. Check the provider's `search()` method is being called
2. Verify the search query is being passed correctly
3. Check browser console for errors
4. Ensure tRPC mutations are working (for tRPC-based providers)

### Results not grouped correctly

1. Verify each provider returns the correct `category` value
2. Check that `priority` values are set as intended
3. Ensure results have unique IDs within each category

### Navigation not working

1. Verify each result item has a valid `url` property
2. Check that `navigateTo()` is being called in the modal
3. Ensure Next.js router is available
